import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },  // Логин (уникальный)
  displayName: { type: String, required: true },  // Ник (отображаемое имя, не уникальное)
  password: { type: String, required: true },
  avatar: { type: String, default: '' },  // URL аватарки
  friends: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  securityQuestion: { type: String, default: '' },
  securityAnswer: { type: String, default: '' },
});

export default mongoose.model('User', userSchema);