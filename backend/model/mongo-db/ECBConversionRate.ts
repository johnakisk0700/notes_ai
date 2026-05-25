import mongoose, { Schema, Document } from 'mongoose';

export interface ECBConversionRate {
    _id?: string;
    rate: number;
    rate_date: Date;
    from: string;
    to: string;
}

// Define the schema for conversation messages
export const ECBConversionRateSchema = new Schema({
    rate: {
        type: Number,
        required: true,
    },
    rate_date: {
        type: Date,
        required: false,
    },
    from: {
        type: String,
        required: true,
    },
    to: {
        type: String,
        required: true,
    },
});

export const ECBConversionRate = mongoose.model<ECBConversionRate>(
    'ECBConversionRate',
    ECBConversionRateSchema
);
