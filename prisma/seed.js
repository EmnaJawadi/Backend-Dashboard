/* eslint-disable no-console */
require('dotenv/config');
const bcrypt = require('bcrypt');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient, UserRole } = require('../dist/src/generated/prisma/client.js');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to run prisma seed');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const SUPER_ADMINS = [
  {
    fullName: 'Maryem Ben Ali',
    email: 'bmaryem290@gmail.com',
    password: 'mimi1234',
  },
  {
    fullName: 'Emna Jawadi',
    email: 'jawadiamna18@gmail.com',
    password: 'emna1234',
  },
];

function getBcryptRounds() {
  const parsed = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
  if (!Number.isFinite(parsed)) {
    return 12;
  }

  return Math.max(10, Math.trunc(parsed));
}

async function upsertSuperAdmin(input) {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(input.password, getBcryptRounds());

  await prisma.user.upsert({
    where: { email },
    update: {
      fullName: input.fullName,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      passwordHash,
      companyId: null,
    },
    create: {
      fullName: input.fullName,
      email,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      companyId: null,
    },
  });
}

async function main() {
  const allowedEmails = SUPER_ADMINS.map((item) => item.email.toLowerCase());

  for (const input of SUPER_ADMINS) {
    await upsertSuperAdmin(input);
  }

  await prisma.user.updateMany({
    where: {
      role: UserRole.SUPER_ADMIN,
      email: { notIn: allowedEmails },
    },
    data: {
      role: UserRole.EMPLOYEE,
      isActive: false,
      companyId: null,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
