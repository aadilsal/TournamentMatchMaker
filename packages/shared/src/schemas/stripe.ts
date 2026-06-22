import { z } from 'zod';
import { buybackSchema } from './buyback.js';

export const buybackCheckoutSchema = buybackSchema;

export type BuybackCheckoutInput = z.infer<typeof buybackCheckoutSchema>;
