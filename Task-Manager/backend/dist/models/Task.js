import mongoose from 'mongoose';
const taskSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    status: { type: String, enum: ['To Do', 'In Progress', 'Done'], default: 'To Do' },
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    deadline: { type: Date },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    labels: [{ name: String, color: String }],
    tags: [String],
    order: { type: Number, default: 0 },
    // Новые поля для архива
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
    // backend/models/Task.ts
    board: { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
}, { timestamps: true });
export default mongoose.model('Task', taskSchema);
