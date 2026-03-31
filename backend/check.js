const { PrismaClient } = require('@prisma/client');

const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL or DIRECT_URL must be set.');
}

const { PrismaPg } = require('@prisma/adapter-pg');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  try {
    const id = '32e8ed76-bea3-491a-9a51-fa0c29f51323';
    const res = await prisma.$queryRaw`
      SELECT id, title
      FROM property
      WHERE id = ${id}
    `;
    console.log(res);
  } catch (error) {
    console.error('Error fetching data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
