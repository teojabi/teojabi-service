import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { DiscoveryController } from './discovery.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { validateItem } from './discovery.validation';

describe('additional member storage',()=>{
  it('requires the existing JWT guard on every route',()=>{
    expect(Reflect.getMetadata(GUARDS_METADATA,DiscoveryController)).toContain(JwtAuthGuard);
  });
  it('takes ownership from the authenticated user and binds SQL values',async()=>{
    const read=jest.fn().mockResolvedValue([]),write=jest.fn().mockResolvedValue(1);
    const count=jest.fn().mockResolvedValue([{total:0n}]);
    const tx={$queryRaw:count,$executeRaw:write};
    const prisma={$queryRaw:read,$executeRaw:write,$transaction:(fn:any)=>fn(tx)};
    const c=new DiscoveryController(prisma as any),req={user:{id:'member-a'},headers:{}};
    await c.getMine(req);
    expect(read.mock.calls[0].slice(1)).toEqual(['member-a']);
    await c.save(req,'favorite','naver:123',{user_id:'member-b',address:'서울',priceWon:1e8});
    const inserted=write.mock.calls.find(args=>args[0].join('').includes('INSERT'))!;
    expect(inserted[1]).toBe('member-a');expect(inserted[4]).not.toContain('member-b');
    await c.remove(req,'favorite','naver:123');
    expect(write.mock.calls[write.mock.calls.length-1].slice(1)).toEqual(['member-a','favorite','naver:123']);
  });
  it('allows configured beta origins and rejects cross-origin writes before touching the database',async()=>{
    const oldFront=process.env.FRONTEND_URL,oldFronts=process.env.FRONTEND_URLS;
    process.env.FRONTEND_URL='https://teojabi.com';process.env.FRONTEND_URLS='http://127.0.0.1:4173, https://beta.teojabi.com';
    try {
      const query=jest.fn().mockResolvedValue(1),c=new DiscoveryController({$executeRaw:query} as any);
      await c.remove({user:{id:'a'},headers:{origin:'http://127.0.0.1:4173'}},'favorite','naver:123');
      await expect(c.remove({user:{id:'a'},headers:{origin:'https://unrelated.example'}},'favorite','naver:123')).rejects.toBeInstanceOf(ForbiddenException);
      expect(query).toHaveBeenCalledTimes(1);
    } finally {
      if(oldFront===undefined)delete process.env.FRONTEND_URL;else process.env.FRONTEND_URL=oldFront;
      if(oldFronts===undefined)delete process.env.FRONTEND_URLS;else process.env.FRONTEND_URLS=oldFronts;
    }
  });
  it('limits storage while allowing an existing key to be replaced',async()=>{
    const count=jest.fn().mockResolvedValue([{total:100n}]),write=jest.fn();
    const c=new DiscoveryController({$transaction:(fn:any)=>fn({$queryRaw:count,$executeRaw:write})} as any);
    await expect(c.save({user:{id:'a'}},'favorite','naver:123',{})).rejects.toBeInstanceOf(BadRequestException);
    expect(count.mock.calls[0].slice(1)).toEqual(['a','favorite','naver:123']);
    expect(write).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed criteria instead of silently broadening saved searches',()=>{
    for(const input of [{budgetWon:-1},{minAreaM2:100,maxAreaM2:50},{districts:['없는구']},{zones:['없는지역']},{bounds:[127,37.7,126,37.5]}])
      expect(()=>validateItem('condition','a',input)).toThrow(BadRequestException);
  });
  it('keeps source IDs separate while accepting current listing key types',()=>{
    expect(validateItem('favorite','naver:2647532280',{address:'서울',priceWon:100})).toEqual({id:'naver:2647532280',address:'서울',priceWon:100,areaM2:null,floorAreaM2:null});
    expect(validateItem('favorite','naver-land:123',{address:'서울'}).id).toBe('naver-land:123');
    expect(validateItem('feedback','premium:eb3a7fa1-4e4f-4c75-bc0f-c6dad1326e67',{choice:'like'}).id).toBe('premium:eb3a7fa1-4e4f-4c75-bc0f-c6dad1326e67');
    expect(validateItem('favorite','disco:4pu1m5ht',{address:'서울',priceWon:100}).id).toBe('disco:4pu1m5ht');
    expect(validateItem('feedback','disco:4pu1m5ht',{choice:'like'}).id).toBe('disco:4pu1m5ht');
    expect(validateItem('favorite','auction:B0002112023013006033611',{address:'서울',priceWon:100}).id).toBe('auction:B0002112023013006033611');
    expect(validateItem('feedback','auction:B0002112023013006033611',{choice:'like'}).id).toBe('auction:B0002112023013006033611');
    expect(validateItem('favorite','onbid:2026-0800-046412::6171219',{address:'서울',priceWon:100}).id).toBe('onbid:2026-0800-046412::6171219');
    expect(()=>validateItem('favorite','legacy-id',{})).toThrow();
  });
  it('keeps auction filters and neighborhoods in saved conditions',()=>{
    const saved=validateItem('condition','a',{districts:['마포구'],neighborhoods:['성산동'],auction:{enabled:true,source:'onbid',usages:['오피스텔','없는용도'],dealType:'unit',maxPriceWon:500000000,maxBidRate:120,failMax:3}});
    expect(saved.districts).toEqual(['마포구']);
    expect(saved.neighborhoods).toEqual(['성산동']);
    expect(saved.auction).toEqual({enabled:true,usages:['오피스텔'],source:'onbid',dealType:'unit',maxPriceWon:500000000,failMax:3});
    expect(saved.auction.maxBidRate).toBeUndefined();
    const invalid=validateItem('condition','a',{auction:{enabled:true,source:'hacked',dealType:'penthouse'}});
    expect(invalid.auction).toEqual({enabled:true,usages:[]});
  });
  it('validates saved parcel areas',()=>{
    expect(()=>validateItem('analysis','a',{pnus:['1144012100101610009'],fields:{landArea:199,bcr:101}})).toThrow();
    expect(()=>validateItem('analysis','a',{pnus:['invalid','1144012100101610009'],fields:{landArea:199}})).toThrow();
    expect(validateItem('analysis','a',{pnus:['1144012100101610009'],fields:{landArea:199,far:600,bcr:60},untrusted:'ignored'})).toEqual({name:'',pnus:['1144012100101610009'],fields:{landArea:199,far:600,bcr:60,height:null},memo:''});
  });
});
