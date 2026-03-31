import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execPromise = promisify(exec);

@Injectable()
export class PublicDataBatchService {
  private readonly logger = new Logger(PublicDataBatchService.name);
  // psql 경로는 환경변수 PSQL_PATH에서 가져옵니다. 미설정 시 기본값 'psql' (PATH에 등록된 경우)
  private readonly psqlPath: string;

  constructor(private configService: ConfigService) {
    this.psqlPath = this.configService.get<string>('PSQL_PATH') || 'psql';
  }

  /**
   * 매주 일요일 새벽 3시에 실행되는 대량 데이터 업데이트 배치
   */
  @Cron(CronExpression.EVERY_WEEKEND)
  async handleBuildingDataUpdate() {
    this.logger.log(
      'Starting scheduled building data update (Optimized Batch)...',
    );

    try {
      const dbUrl = this.configService.get<string>('DATABASE_URL');
      if (!dbUrl) throw new Error('DATABASE_URL is not defined in .env');

      // URL에서 접속 정보 추출 (postgresql://user:pass@host:port/db)
      const url = new URL(dbUrl);
      const host = url.hostname;
      const port = url.port || '5432';
      const user = url.username;
      const password = decodeURIComponent(url.password);
      const database = url.pathname.substring(1);

      // 프로젝트 루트 기준의 파일 경로 설정
      const projectRoot = process.cwd();
      const infoCsvPath = path.join(
        projectRoot,
        'database',
        'staging_building_info.csv',
      );
      const floorCsvPath = path.join(
        projectRoot,
        'database',
        'staging_floor_status.csv',
      );
      const storeCsvPath = path.join(
        projectRoot,
        'database',
        'staging_store_info.csv',
      );
      const sqlScriptPath = path.join(
        projectRoot,
        'database',
        'init',
        '06-full-import-optimized.sql',
      );

      // Step 1: SQL 스크립트를 한 번 실행하여 스테이징 테이블이 없으면 생성합니다.
      // (이후 \copy를 수행하기 위해 테이블이 필요합니다)
      this.logger.log('Step 1: Creating staging tables if they do not exist...');
      await this.runPsqlCommand(
        host,
        port,
        user,
        password,
        database,
        `-f "${sqlScriptPath}"`,
      );

      // Step 2, 3, 4: \copy를 수행하여 CSV 데이터를 로드합니다.
      this.logger.log('Step 2: Loading building_info via \\copy...');
      const copyInfoCmd = `\\copy staging_building_info FROM '${infoCsvPath.replace(/\\/g, '/')}' WITH (FORMAT CSV, HEADER, ENCODING 'UTF8', NULL '')`;
      await this.runPsqlCommand(
        host,
        port,
        user,
        password,
        database,
        `-c "${copyInfoCmd}"`,
      );

      this.logger.log('Step 3: Loading floor_status via \\copy...');
      const copyFloorCmd = `\\copy staging_floor_status FROM '${floorCsvPath.replace(/\\/g, '/')}' WITH (FORMAT CSV, HEADER, ENCODING 'UTF8', NULL '')`;
      await this.runPsqlCommand(
        host,
        port,
        user,
        password,
        database,
        `-c "${copyFloorCmd}"`,
      );

      this.logger.log('Step 4: Loading store_info via \\copy...');
      const copyStoreCmd = `\\copy staging_store_info FROM '${storeCsvPath.replace(/\\/g, '/')}' WITH (FORMAT CSV, HEADER, ENCODING 'UTF8', NULL '')`;
      await this.runPsqlCommand(
        host,
        port,
        user,
        password,
        database,
        `-c "${copyStoreCmd}"`,
      );

      // Step 5: 다시 SQL 스크립트를 실행합니다. 
      // 이때는 테이블이 이미 있고 데이터도 차 있으므로, 인덱스 생성 및 INSERT INTO ... SELECT 가 수행됩니다.
      this.logger.log('Step 5: Running transform and cleanup script...');
      await this.runPsqlCommand(
        host,
        port,
        user,
        password,
        database,
        `-f "${sqlScriptPath}"`,
      );

      this.logger.log('Public data batch update completed successfully.');
    } catch (error) {
      this.logger.error(`Batch update failed: ${error.message}`);
    }
  }

  /**
   * psql 명령어를 실행하는 유틸리티
   */
  private async runPsqlCommand(
    host: string,
    port: string,
    user: string,
    pass: string,
    db: string,
    args: string,
  ) {
    const command = `"${this.psqlPath}" -h ${host} -p ${port} -U ${user} -d ${db} ${args}`;

    try {
      const { stdout, stderr } = await execPromise(command, {
        env: { ...process.env, PGPASSWORD: pass },
      });
      if (stderr && !stderr.includes('NOTICE')) {
        this.logger.warn(`psql stderr: ${stderr}`);
      }
      return stdout;
    } catch (error) {
      throw new Error(`psql execution failed: ${error.message}`);
    }
  }
}
