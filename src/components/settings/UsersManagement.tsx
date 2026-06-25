import React, { useEffect, useMemo, useState } from 'react';
import { usersService, getRoleDefaults } from '../../services/users';
import { logger } from '../../utils/logger';
import { useAuth } from '../../context/AuthContext';
import { useStaticData } from '../../context/DataContext';
import { useToast } from '../UI';
import { Icon } from '../Icons';
import { Modal } from '../UI';
import { UserProfile, UserRole, Permission, PageId } from '../../types';
import { ROLE_DEFINITIONS } from '../../constants';

const ALL_PERMISSIONS: { id: Permission; label: string }[] = [
    { id: 'view_dashboard', label: 'Видеть рабочий стол' },
    { id: 'view_schedule', label: 'Видеть расписание' },
    { id: 'edit_schedule', label: 'Редактировать расписание' },
    { id: 'view_substitutions', label: 'Видеть замены' },
    { id: 'edit_substitutions', label: 'Редактировать замены' },
    { id: 'view_duty', label: 'Видеть дежурства' },
    { id: 'edit_duty', label: 'Редактировать дежурства' },
    { id: 'view_nutrition', label: 'Видеть питание' },
    { id: 'edit_nutrition', label: 'Редактировать питание' },
    { id: 'view_absenteeism', label: 'Видеть пропуски' },
    { id: 'edit_absenteeism', label: 'Редактировать пропуски' },
    { id: 'view_bells', label: 'Видеть звонки' },
    { id: 'edit_bells', label: 'Редактировать звонки' },
    { id: 'view_directory', label: 'Видеть справочники' },
    { id: 'edit_directory', label: 'Редактировать справочники' },
    { id: 'view_reports', label: 'Видеть отчёты' },
    { id: 'view_export', label: 'Видеть экспорт' },
    { id: 'view_admin', label: 'Видеть администрирование' },
    { id: 'view_settings', label: 'Видеть настройки' },
    { id: 'manage_users', label: 'Управлять пользователями' }
];

const ALL_PAGES: { id: PageId; label: string }[] = [
    { id: 'dashboard', label: 'Рабочий стол' },
    { id: 'schedule', label: 'Расписание 1 пол.' },
    { id: 'schedule2', label: 'Расписание 2 пол.' },
    { id: 'substitutions', label: 'Замены' },
    { id: 'duty', label: 'Дежурство' },
    { id: 'nutrition', label: 'Питание' },
    { id: 'absenteeism', label: 'Пропуски' },
    { id: 'bells', label: 'Звонки' },
    { id: 'directory', label: 'Справочники' },
    { id: 'reports', label: 'Отчёты' },
    { id: 'export', label: 'Экспорт' },
    { id: 'admin', label: 'Администрирование' },
    { id: 'calendar', label: 'Календарь' },
    { id: 'planner', label: 'Планер' },
    { id: 'archive', label: 'Архив' },
    { id: 'settings', label: 'Настройки' },
    { id: 'users', label: 'Пользователи' }
];

const formatDate = (iso?: string) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('ru-RU');
};

export const UsersManagement = () => {
    const { user: currentUser, profile: currentProfile } = useAuth();
    const { teachers } = useStaticData();
    const { addToast } = useToast();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

    const emptyForm = useMemo(
        () => ({
            email: '',
            password: '',
            displayName: '',
            firstName: '',
            role: 'teacher' as UserRole,
            teacherId: '',
            permissions: [] as Permission[],
            allowedPages: [] as PageId[]
        }),
        []
    );
    const [form, setForm] = useState(emptyForm);
    const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

    const loadUsers = async () => {
        try {
            setLoading(true);
            const list = await usersService.getAll();
            setUsers(list.sort((a, b) => a.displayName.localeCompare(b.displayName)));
            setSelectedUserIds(new Set());
        } catch {
            addToast({ type: 'danger', title: 'Ошибка', message: 'Не удалось загрузить пользователей' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadUsers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const applyRoleDefaults = (role: UserRole) => {
        const defaults = getRoleDefaults(role);
        setForm((prev) => ({
            ...prev,
            permissions: [...defaults.defaultPermissions],
            allowedPages: [...defaults.defaultPages]
        }));
    };

    const openCreate = () => {
        setEditingUser(null);
        const defaults = getRoleDefaults('teacher');
        setForm({
            ...emptyForm,
            role: 'teacher',
            permissions: [...defaults.defaultPermissions],
            allowedPages: [...defaults.defaultPages]
        });
        setIsModalOpen(true);
    };

    const openEdit = (u: UserProfile) => {
        setEditingUser(u);
        setForm({
            email: u.email,
            password: '',
            displayName: u.displayName,
            firstName: u.firstName || '',
            role: u.role,
            teacherId: u.teacherId || '',
            permissions: u.permissions,
            allowedPages: u.allowedPages
        });
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingUser(null);
        setForm(emptyForm);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingUser) {
                await usersService.update(editingUser.id, {
                    displayName: form.displayName,
                    firstName: form.firstName,
                    role: form.role,
                    teacherId: form.teacherId || undefined,
                    permissions: form.permissions,
                    allowedPages: form.allowedPages,
                    password: form.password || undefined
                });
                addToast({ type: 'success', title: 'Сохранено', message: 'Права пользователя обновлены' });
            } else {
                if (!form.password || form.password.length < 6) {
                    addToast({ type: 'warning', title: 'Пароль слишком короткий', message: 'Минимум 6 символов' });
                    return;
                }
                await usersService.create({
                    email: form.email,
                    password: form.password,
                    displayName: form.displayName,
                    firstName: form.firstName,
                    role: form.role,
                    teacherId: form.teacherId || undefined,
                    permissions: form.permissions,
                    allowedPages: form.allowedPages,
                    createdBy: currentUser?.uid
                });
                addToast({ type: 'success', title: 'Пользователь создан' });
            }
            closeModal();
            await loadUsers();
        } catch (err) {
            logger.error(err);
            addToast({ type: 'danger', title: 'Ошибка', message: `Не удалось сохранить: ${err}` });
        }
    };

    const toggleActive = async (u: UserProfile) => {
        if (u.id === currentUser?.uid) {
            addToast({ type: 'warning', title: 'Нельзя заблокировать себя' });
            return;
        }
        try {
            await usersService.setActive(u.id, !u.isActive);
            await loadUsers();
            addToast({
                type: 'success',
                title: u.isActive ? 'Пользователь заблокирован' : 'Пользователь активирован'
            });
        } catch (err) {
            logger.error(err);
            addToast({ type: 'danger', title: 'Ошибка', message: 'Не удалось изменить статус' });
        }
    };

    const handleDelete = async (u: UserProfile) => {
        if (u.id === currentUser?.uid) {
            addToast({ type: 'warning', title: 'Нельзя удалить себя' });
            return;
        }
        if (!window.confirm(`Удалить пользователя ${u.displayName}?`)) return;
        try {
            await usersService.delete(u.id);
            await loadUsers();
            addToast({ type: 'success', title: 'Пользователь удалён' });
        } catch {
            addToast({ type: 'danger', title: 'Ошибка', message: 'Не удалось удалить пользователя' });
        }
    };

    const togglePermission = (permission: Permission) => {
        setForm((prev) => ({
            ...prev,
            permissions: prev.permissions.includes(permission)
                ? prev.permissions.filter((p) => p !== permission)
                : [...prev.permissions, permission]
        }));
    };

    const togglePage = (pageId: PageId) => {
        setForm((prev) => ({
            ...prev,
            allowedPages: prev.allowedPages.includes(pageId)
                ? prev.allowedPages.filter((p) => p !== pageId)
                : [...prev.allowedPages, pageId]
        }));
    };

    const toggleSelectUser = (id: string) => {
        setSelectedUserIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAll = () => {
        if (selectedUserIds.size === users.length) {
            setSelectedUserIds(new Set());
        } else {
            setSelectedUserIds(new Set(users.map((u) => u.id)));
        }
    };

    const bulkDeactivate = async () => {
        if (!window.confirm(`Заблокировать ${selectedUserIds.size} пользователей?`)) return;
        try {
            const promises = Array.from(selectedUserIds).map((id) => usersService.setActive(id, false));
            await Promise.all(promises);
            await loadUsers();
            addToast({ type: 'success', title: 'Готово', message: `${selectedUserIds.size} пользователей заблокировано` });
        } catch {
            addToast({ type: 'danger', title: 'Ошибка', message: 'Не удалось выполнить массовое действие' });
        }
    };

    const bulkDelete = async () => {
        if (!window.confirm(`Удалить ${selectedUserIds.size} пользователей? Это необратимо.`)) return;
        try {
            const promises = Array.from(selectedUserIds).map((id) => usersService.delete(id));
            await Promise.all(promises);
            await loadUsers();
            addToast({ type: 'success', title: 'Готово', message: `${selectedUserIds.size} пользователей удалено` });
        } catch {
            addToast({ type: 'danger', title: 'Ошибка', message: 'Не удалось выполнить массовое действие' });
        }
    };

    if (currentProfile?.role !== 'admin') {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <Icon name="Shield" size={48} className="mb-4" />
                <p className="text-lg font-medium">Доступ запрещён</p>
                <p className="text-sm">Только администратор может управлять пользователями</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white">Пользователи</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Создавайте учётные записи, настраивайте роли, права и доступные разделы
                    </p>
                </div>
                <button
                    onClick={openCreate}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors"
                >
                    <Icon name="Plus" size={18} />
                    Добавить пользователя
                </button>
            </div>

            {loading ? (
                <div className="text-center py-12 text-slate-500">Загрузка...</div>
            ) : users.length === 0 ? (
                <div className="text-center py-12 bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                    <Icon name="Users" size={48} className="mx-auto mb-3 text-slate-300" />
                    <p className="text-slate-500">Пользователей пока нет</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {selectedUserIds.size > 0 && (
                        <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                            <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                                Выбрано: {selectedUserIds.size}
                            </span>
                            <div className="flex-1" />
                            <button
                                onClick={bulkDeactivate}
                                className="px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                            >
                                Заблокировать
                            </button>
                            <button
                                onClick={bulkDelete}
                                className="px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 bg-white dark:bg-slate-800 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                            >
                                Удалить
                            </button>
                            <button
                                onClick={() => setSelectedUserIds(new Set())}
                                className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            >
                                Снять выбор
                            </button>
                        </div>
                    )}
                    <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                    <tr>
                                        <th className="px-4 py-3 w-10">
                                            <input
                                                type="checkbox"
                                                checked={selectedUserIds.size === users.length && users.length > 0}
                                                onChange={selectAll}
                                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                        </th>
                                        <th className="px-4 py-3 font-semibold">Пользователь</th>
                                        <th className="px-4 py-3 font-semibold">Роль</th>
                                        <th className="px-4 py-3 font-semibold">Разрешения</th>
                                        <th className="px-4 py-3 font-semibold">Разделы</th>
                                        <th className="px-4 py-3 font-semibold">Статус</th>
                                        <th className="px-4 py-3 font-semibold">Последний вход</th>
                                        <th className="px-4 py-3 font-semibold text-right">Действия</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {users.map((u) => (
                                        <tr key={u.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 ${selectedUserIds.has(u.id) ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''}`}>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedUserIds.has(u.id)}
                                                    onChange={() => toggleSelectUser(u.id)}
                                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                    disabled={u.id === currentUser?.uid}
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-slate-800 dark:text-slate-100">{u.displayName}</div>
                                                <div className="text-xs text-slate-500">{u.email}</div>
                                                {u.teacherId && (
                                                    <div className="text-[10px] text-indigo-500 mt-0.5">
                                                        Учитель: {teachers.find((t) => t.id === u.teacherId)?.name || u.teacherId}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300">
                                                    {ROLE_DEFINITIONS.find((r) => r.id === u.role)?.name || u.role}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="text-xs text-slate-500">{u.permissions.length} прав</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="text-xs text-slate-500">{u.allowedPages.length} разделов</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <button
                                                    onClick={() => toggleActive(u)}
                                                    className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                                                        u.isActive
                                                            ? 'text-emerald-600 dark:text-emerald-400'
                                                            : 'text-slate-400 dark:text-slate-500'
                                                    }`}
                                                >
                                                    <span
                                                        className={`w-2 h-2 rounded-full ${
                                                            u.isActive ? 'bg-emerald-500' : 'bg-slate-300'
                                                        }`}
                                                    />
                                                    {u.isActive ? 'Активен' : 'Заблокирован'}
                                                </button>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-slate-500">{formatDate(u.lastLoginAt)}</td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="inline-flex items-center gap-2">
                                                    <button
                                                        onClick={() => openEdit(u)}
                                                        className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                        title="Редактировать"
                                                    >
                                                        <Icon name="Edit2" size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(u)}
                                                        className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Удалить"
                                                    >
                                                        <Icon name="Trash2" size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            <Modal isOpen={isModalOpen} onClose={closeModal} title={editingUser ? 'Редактировать пользователя' : 'Новый пользователь'} maxWidth="max-w-3xl">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">ФИО / Имя</label>
                            <input
                                type="text"
                                value={form.displayName}
                                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-dark-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Как обращаться</label>
                            <input
                                type="text"
                                value={form.firstName}
                                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-dark-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="Иван"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Email</label>
                            <input
                                type="email"
                                value={form.email}
                                disabled={!!editingUser}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-dark-700 disabled:bg-slate-100 dark:disabled:bg-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                {editingUser ? 'Новый пароль (оставьте пустым, чтобы не менять)' : 'Пароль'}
                            </label>
                            <input
                                type="password"
                                value={form.password}
                                onChange={(e) => setForm({ ...form, password: e.target.value })}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-dark-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                                minLength={editingUser ? undefined : 6}
                                required={!editingUser}
                            />
                        </div>

                        <div className="md:col-span-2 flex items-end gap-3">
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Роль</label>
                                <select
                                    value={form.role}
                                    onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as UserRole }))}
                                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-dark-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                    {ROLE_DEFINITIONS.map((r) => (
                                        <option key={r.id} value={r.id}>
                                            {r.name} — {r.description}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <button
                                type="button"
                                onClick={() => applyRoleDefaults(form.role)}
                                className="px-3 py-2.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400 dark:hover:bg-indigo-900/30 rounded-xl border border-indigo-200 dark:border-indigo-800 transition-colors shrink-0"
                                title="Сбросить права и разделы на значения по умолчанию для выбранной роли"
                            >
                                Применить права роли
                            </button>
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Привязка к учителю (необязательно)</label>
                            <select
                                value={form.teacherId}
                                onChange={(e) => setForm((prev) => ({ ...prev, teacherId: e.target.value }))}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-dark-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="">— Не привязан —</option>
                                {teachers
                                    .slice()
                                    .sort((a, b) => a.name.localeCompare(b.name))
                                    .map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.name}
                                        </option>
                                    ))}
                            </select>
                            <p className="text-[11px] text-slate-400 mt-1">Позволяет системе понимать, какой учитель соответствует этой учётной записи</p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Разрешения</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2 p-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-dark-700/50">
                            {ALL_PERMISSIONS.map((p) => (
                                <label
                                    key={p.id}
                                    className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        checked={form.permissions.includes(p.id)}
                                        onChange={() => togglePermission(p.id)}
                                        className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span>{p.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Доступные разделы</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2 p-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-dark-700/50">
                            {ALL_PAGES.map((p) => (
                                <label
                                    key={p.id}
                                    className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        checked={form.allowedPages.includes(p.id)}
                                        onChange={() => togglePage(p.id)}
                                        className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span>{p.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={closeModal}
                            className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        >
                            Отмена
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors"
                        >
                            {editingUser ? 'Сохранить' : 'Создать'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};
