import mongoose from 'mongoose';

const boardSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  inviteCode: { type: String, unique: true, sparse: true },
  inviteUsed: { type: Boolean, default: false },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
});

export default mongoose.model('Board', boardSchema);