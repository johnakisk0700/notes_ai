import mongoose, { Document } from 'mongoose';

export interface IUser extends Document {
    email: string;
    name?: string;
    avatar_url?: string;
    google_id?: string;
    is_free_user: boolean;
    free_user_uuid?: string; // Add this field
    created_at: Date;
    updated_at: Date;
    is_active: boolean;
    settings: {
        ai_model: string;
        sidebar_open: boolean;
    };
}

// Define the schema
const UserSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true,
    },
    name: {
        type: String,
        trim: true,
    },
    avatar_url: {
        type: String,
    },
    google_id: {
        type: String,
        unique: true,
        sparse: true,
        index: true,
    },
    is_free_user: {
        type: Boolean,
        default: false,
        index: true,
    },
    free_user_uuid: {
        // Add this field
        type: String,
        unique: true,
        sparse: true, // Allows null values while maintaining uniqueness
        index: true,
    },
    settings: {
        ai_model: {
            type: String,
            default: 'gpt-4.1',
        },
        sidebar_open: {
            type: Boolean,
            default: false,
        },
    },
    created_at: {
        type: Date,
        default: Date.now,
        index: true,
    },
    updated_at: {
        type: Date,
        default: Date.now,
    },
    is_active: {
        type: Boolean,
        default: true,
    },
});

// Update the updated_at field before saving
UserSchema.pre('save', function (next) {
    this.updated_at = new Date();
    next();
});

// Create compound indexes
UserSchema.index({ email: 1, is_active: 1 });
UserSchema.index({ is_free_user: 1, is_active: 1 });
UserSchema.index({ free_user_uuid: 1, is_free_user: 1 }); // Add index for free users

export const User = mongoose.model<IUser>('User', UserSchema);
