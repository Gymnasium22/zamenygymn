import React, { useState, useEffect } from 'react';
import { Icon } from '../components/Icons';
import { useToast } from '../components/UI';
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/localStorage';
import { generateId } from '../utils/helpers';

interface PlannerTask {
    id: string;
    title: string;
    description?: string;
    deadline?: string; // YYYY-MM-DD
    priority: 'low' | 'medium' | 'high';
    status: 'todo' | 'in-progress' | 'done';
    createdAt: string;
    completedAt?: string;
}

const PRIORITY_COLORS: Record<PlannerTask['priority'], string> = {
    low: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600',
    medium: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
    high: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
};

const PRIORITY_LABELS: Record<PlannerTask['priority'], string> = {
    low: 'Низкий',
    medium: 'Средний',
    high: 'Высокий'
};

const STATUS_LABELS: Record<PlannerTask['status'], string> = {
    todo: 'К выполнению',
    'in-progress': 'В работе',
    done: 'Готово'
};

const STORAGE_KEY = 'gym_planner_tasks';

export const PlannerPage = () => {
    const { addToast } = useToast();
    const [tasks, setTasks] = useState<PlannerTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<PlannerTask['status'] | 'all'>('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<PlannerTask | null>(null);
    const [form, setForm] = useState<Partial<PlannerTask>>({
        title: '',
        description: '',
        priority: 'medium',
        status: 'todo',
        deadline: ''
    });

    useEffect(() => {
        const stored = safeLocalStorageGet(STORAGE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) setTasks(parsed);
            } catch {
                // ignore
            }
        }
        setLoading(false);
    }, []);

    const saveTasks = (newTasks: PlannerTask[]) => {
        setTasks(newTasks);
        safeLocalStorageSet(STORAGE_KEY, JSON.stringify(newTasks));
    };

    const openAdd = () => {
        setEditingTask(null);
        setForm({ title: '', description: '', priority: 'medium', status: 'todo', deadline: '' });
        setIsModalOpen(true);
    };

    const openEdit = (task: PlannerTask) => {
        setEditingTask(task);
        setForm({ ...task });
        setIsModalOpen(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.title?.trim()) return;

        const newTask: PlannerTask = {
            id: editingTask?.id || generateId(),
            title: form.title.trim(),
            description: form.description?.trim(),
            priority: form.priority || 'medium',
            status: form.status || 'todo',
            deadline: form.deadline,
            createdAt: editingTask?.createdAt || new Date().toISOString(),
            completedAt: form.status === 'done' ? new Date().toISOString() : undefined
        };

        const newTasks = editingTask
            ? tasks.map((t) => (t.id === editingTask.id ? newTask : t))
            : [...tasks, newTask];

        saveTasks(newTasks);
        setIsModalOpen(false);
        addToast({ type: 'success', title: 'Сохранено', message: editingTask ? 'Задача обновлена' : 'Задача создана' });
    };

    const handleDelete = (id: string) => {
        if (!window.confirm('Удалить задачу?')) return;
        saveTasks(tasks.filter((t) => t.id !== id));
        addToast({ type: 'success', title: 'Удалено', message: 'Задача удалена' });
    };

    const toggleStatus = (task: PlannerTask) => {
        const nextStatus: Record<PlannerTask['status'], PlannerTask['status']> = {
            todo: 'in-progress',
            'in-progress': 'done',
            done: 'todo'
        };
        const newStatus = nextStatus[task.status];
        const updated = tasks.map((t) =>
            t.id === task.id
                ? { ...t, status: newStatus, completedAt: newStatus === 'done' ? new Date().toISOString() : undefined }
                : t
        );
        saveTasks(updated);
    };

    const filteredTasks = tasks.filter((t) => (filter === 'all' ? true : t.status === filter));
    const sortedTasks = [...filteredTasks].sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
        return 0;
    });

    const stats = {
        todo: tasks.filter((t) => t.status === 'todo').length,
        inProgress: tasks.filter((t) => t.status === 'in-progress').length,
        done: tasks.filter((t) => t.status === 'done').length
    };

    const isOverdue = (task: PlannerTask) => {
        if (!task.deadline || task.status === 'done') return false;
        return new Date(task.deadline) < new Date(new Date().toISOString().split('T')[0]);
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Icon name="Loader" size={32} className="animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col max-w-4xl mx-auto w-full">
            <div className="shrink-0 mb-4">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                            <Icon name="CheckSquare" className="text-indigo-600 dark:text-indigo-400" />
                            Планер администрации
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                            Задачи, дедлайны и приоритеты
                        </p>
                    </div>
                    <button
                        onClick={openAdd}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition flex items-center gap-2"
                    >
                        <Icon name="Plus" size={18} />
                        Новая задача
                    </button>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-white dark:bg-dark-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4">
                        <div className="text-2xl font-bold text-slate-800 dark:text-white">{stats.todo}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">К выполнению</div>
                    </div>
                    <div className="bg-white dark:bg-dark-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4">
                        <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.inProgress}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">В работе</div>
                    </div>
                    <div className="bg-white dark:bg-dark-800 rounded-xl border border-slate-100 dark:border-slate-700 p-4">
                        <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.done}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Готово</div>
                    </div>
                </div>

                <div className="flex gap-2">
                    {([
                        { id: 'all', label: 'Все' },
                        { id: 'todo', label: 'К выполнению' },
                        { id: 'in-progress', label: 'В работе' },
                        { id: 'done', label: 'Готово' }
                    ] as const).map((f) => (
                        <button
                            key={f.id}
                            onClick={() => setFilter(f.id)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                filter === f.id
                                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400'
                                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-auto space-y-3 pr-1">
                {sortedTasks.length === 0 ? (
                    <div className="text-center py-12 bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                        <Icon name="CheckSquare" size={48} className="mx-auto mb-3 text-slate-300" />
                        <p className="text-slate-500 dark:text-slate-400">Задач пока нет</p>
                    </div>
                ) : (
                    sortedTasks.map((task) => (
                        <div
                            key={task.id}
                            className={`bg-white dark:bg-dark-800 rounded-xl border p-4 transition-all hover:shadow-md ${
                                task.status === 'done'
                                    ? 'border-slate-100 dark:border-slate-700 opacity-60'
                                    : isOverdue(task)
                                    ? 'border-red-200 dark:border-red-800 ring-1 ring-red-100 dark:ring-red-900/20'
                                    : 'border-slate-100 dark:border-slate-700'
                            }`}
                        >
                            <div className="flex items-start gap-3">
                                <button
                                    onClick={() => toggleStatus(task)}
                                    className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                                        task.status === 'done'
                                            ? 'bg-emerald-500 border-emerald-500 text-white'
                                            : task.status === 'in-progress'
                                            ? 'border-amber-400 bg-amber-50'
                                            : 'border-slate-300 dark:border-slate-600'
                                    }`}
                                >
                                    {task.status === 'done' && <Icon name="Check" size={12} />}
                                    {task.status === 'in-progress' && <div className="w-2 h-2 rounded-full bg-amber-400" />}
                                </button>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className={`font-bold text-sm ${task.status === 'done' ? 'line-through text-slate-400' : 'text-slate-800 dark:text-white'}`}>
                                            {task.title}
                                        </h3>
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${PRIORITY_COLORS[task.priority]}`}>
                                            {PRIORITY_LABELS[task.priority]}
                                        </span>
                                        {isOverdue(task) && (
                                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 border border-red-200">
                                                Просрочено
                                            </span>
                                        )}
                                    </div>
                                    {task.description && (
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{task.description}</p>
                                    )}
                                    {task.deadline && (
                                        <div className={`text-xs mt-1 flex items-center gap-1 ${isOverdue(task) ? 'text-red-500 font-medium' : 'text-slate-400 dark:text-slate-500'}`}>
                                            <Icon name="Calendar" size={12} />
                                            Дедлайн: {new Date(task.deadline).toLocaleDateString('ru-RU')}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => openEdit(task)}
                                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                    >
                                        <Icon name="Edit2" size={14} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(task.id)}
                                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                    >
                                        <Icon name="Trash2" size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white dark:bg-dark-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">
                            {editingTask ? 'Редактировать задачу' : 'Новая задача'}
                        </h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Название</label>
                                <input
                                    type="text"
                                    value={form.title}
                                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-dark-700 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Описание</label>
                                <textarea
                                    value={form.description}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    rows={3}
                                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-dark-700 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 resize-none"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Приоритет</label>
                                    <select
                                        value={form.priority}
                                        onChange={(e) => setForm({ ...form, priority: e.target.value as PlannerTask['priority'] })}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-dark-700 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500"
                                    >
                                        <option value="low">Низкий</option>
                                        <option value="medium">Средний</option>
                                        <option value="high">Высокий</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Статус</label>
                                    <select
                                        value={form.status}
                                        onChange={(e) => setForm({ ...form, status: e.target.value as PlannerTask['status'] })}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-dark-700 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500"
                                    >
                                        <option value="todo">К выполнению</option>
                                        <option value="in-progress">В работе</option>
                                        <option value="done">Готово</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Дедлайн</label>
                                <input
                                    type="date"
                                    value={form.deadline || ''}
                                    onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-dark-700 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500"
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm font-medium"
                                >
                                    Отмена
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors text-sm font-medium"
                                >
                                    Сохранить
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
