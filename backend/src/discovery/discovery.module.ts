import {Module} from '@nestjs/common';
import {DiscoveryController} from './discovery.controller';
import {PrismaModule} from '../prisma/prisma.module';
@Module({imports:[PrismaModule],controllers:[DiscoveryController]})
export class DiscoveryModule{}
