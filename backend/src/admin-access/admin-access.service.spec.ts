import { AdminAccessService } from './admin-access.service';

describe('administrator delegation',()=>{
  it('non-master cannot grant access or modify existing members',async()=>{
    const tx={$queryRaw:jest.fn().mockResolvedValue([]),user:{update:jest.fn(),findFirst:jest.fn()},$executeRaw:jest.fn()};
    const db={$transaction:(fn:any)=>fn(tx)};
    const service=new AdminAccessService(db as any);
    await expect(service.addAdmin('ordinary-admin','member@example.com')).rejects.toMatchObject({status:403});
    expect(tx.user.findFirst).not.toHaveBeenCalled();expect(tx.user.update).not.toHaveBeenCalled();expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('inactive master membership cannot manage administrators',async()=>{
    const db={$queryRaw:jest.fn().mockResolvedValue([{accessLevel:'MASTER',active:false}])};
    const service=new AdminAccessService(db as any);
    expect(await service.getMyAccess('inactive')).toEqual({accessLevel:null,canManageAdmins:false});
  });
  it('master cannot remove their own access',async()=>{
    const db={$transaction:jest.fn()};const service=new AdminAccessService(db as any);
    await expect(service.removeAdmin('master','master')).rejects.toMatchObject({status:400});
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
