import mongoose from 'mongoose';

const friendRequestSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
});

// Защита от дублей запросов
friendRequestSchema.index({ from: 1, to: 1 }, { unique: true });

export default mongoose.model('FriendRequest', friendRequestSchema);