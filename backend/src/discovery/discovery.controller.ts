import { Controller,Get,Put,Delete,Param,Body,Request,UseGuards,BadRequestException,ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { KINDS,validateItem } from './discovery.validation';

@Controller('api/v1/discovery')
@UseGuards(JwtAuthGuard)
export class DiscoveryController {
  constructor(private readonly prisma:PrismaService){}
  private allowedOrigins() {
    return [process.env.FRONTEND_URL||'http://localhost:3000',...(process.env.FRONTEND_URLS||'').split(',')]
      .map(origin=>origin.trim())
      .filter((origin,index,origins)=>origin&&origins.indexOf(origin)===index);
  }
  private checkOrigin(req:any) {
    const origin=req.headers?.origin;
    if(origin&&!this.allowedOrigins().includes(origin))throw new ForbiddenException('Invalid request origin');
  }
  @Get('me')
  async getMine(@Request() req:any) {
    return {items:await this.prisma.$queryRaw`SELECT kind,item_key AS key,payload,created_at AS "createdAt",updated_at AS "updatedAt" FROM public.discovery_item WHERE user_id=${req.user.id} ORDER BY updated_at DESC LIMIT 400`};
  }
  @Put(':kind/:key')
  async save(@Request() req:any,@Param('kind') kind:string,@Param('key') key:string,@Body() input:any) {
    this.checkOrigin(req);
    const payload=validateItem(kind,key,input),userId=req.user.id;
    await this.prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId},0))`;
      const count=await tx.$queryRaw<Array<{total:bigint}>>`SELECT count(*) AS total FROM public.discovery_item WHERE user_id=${userId} AND kind=${kind} AND item_key<>${key}`;
      if(Number(count[0].total)>=100)throw new BadRequestException('최대 100개까지 저장할 수 있어요.');
      await tx.$executeRaw`INSERT INTO public.discovery_item(user_id,kind,item_key,payload) VALUES (${userId},${kind},${key},${JSON.stringify(payload)}::jsonb) ON CONFLICT(user_id,kind,item_key) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()`;
    });
    return {saved:true};
  }
  @Delete(':kind/:key')
  async remove(@Request() req:any,@Param('kind') kind:string,@Param('key') key:string) {
    this.checkOrigin(req);
    if(!KINDS.includes(kind)||key.length>100)throw new BadRequestException('Invalid item');
    await this.prisma.$executeRaw`DELETE FROM public.discovery_item WHERE user_id=${req.user.id} AND kind=${kind} AND item_key=${key}`;
    return {removed:true};
  }
}
