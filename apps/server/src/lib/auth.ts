import { betterAuth } from 'better-auth';
import { sqlite } from '../db/index.js';

export const auth = betterAuth({
  database: sqlite,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  socialProviders: {},
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
});
