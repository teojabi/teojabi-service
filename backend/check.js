const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
