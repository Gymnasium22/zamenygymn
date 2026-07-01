import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { useToast, Modal } from '../UI';
import { Icon } from '../Icons';
import { Organization } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { auditLog } from '../../services/auditLog';

const emptyForm: Organization = {
    id: '',
    name: '',
    type: 'gymnasium',
    city: '',
    address: '',
    contactEmail: '',
    logoUrl: '',
    isActive: true
};

export const OrganizationsManagement: React.FC = () => {
    const { addToast } = useToast();
    const { refreshOrganizations, user, profile } = useAuth();
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
    const [form, setForm] = useState<Organization>(emptyForm);

    const loadOrganizations = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase.from('organizations').select('*').order('name');
            if (error) throw error;
            const list = (data || []).map((o: Record<string, unknown>) => ({
                id: o.id as string,
                name: o.name as string,
                type: (o.type as string) || 'gymnasium',
                city: (o.city as string) || '',
                address: (o.address as string) || '',
                contactEmail: (o.contact_email as string) || '',
                logoUrl: (o.logo_url as string) || '',
                isActive: (o.is_active as boolean) !== false
            })) as Organization[];
            setOrganizations(list);
        } catch {
            addToast({ type: 'danger', title: 'Ошибка', message: 'Не удалось загрузить организации' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadOrganizations();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const openCreate = () => {
        setEditingOrg(null);
        setForm(emptyForm);
        setIsModalOpen(true);
    };

    const openEdit = (org: Organization) => {
        setEditingOrg(org);
        setForm({ ...org });
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingOrg(null);
        setForm(emptyForm);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload = {
                name: form.name,
                type: form.type,
                city: form.city || null,
                address: form.address || null,
                contact_email: form.contactEmail || null,
                logo_url: form.logoUrl || null,
                is_active: form.isActive
            };
            if (editingOrg) {
                const { error } = await supabase.from('organizations').update(payload).eq('id', editingOrg.id);
                if (error) throw error;
                auditLog.log(
                    user?.email || 'unknown',
                    profile?.role || 'unknown',
                    'update',
                    'organization',
                    form.name,
                    `Обновлена организация ${form.name}`,
                    editingOrg.id
                );
                addToast({ type: 'success', title: 'Сохранено', message: 'Организация обновлена' });
            } else {
                const newId = crypto.randomUUID();
                const { error } = await supabase.from('organizations').insert({ ...payload, id: newId });
                if (error) throw error;
                auditLog.log(
                    user?.email || 'unknown',
                    profile?.role || 'unknown',
                    'create',
                    'organization',
                    form.name,
                    `Создана организация ${form.name}`,
                    newId
                );
                addToast({ type: 'success', title: 'Создано', message: 'Организация добавлена' });
            }
            closeModal();
            await loadOrganizations();
            await refreshOrganizations();
        } catch (err) {
            addToast({ type: 'danger', title: 'Ошибка', message: `Не удалось сохранить: ${err}` });
        }
    };

    const handleDelete = async (org: Organization) => {
        if (!window.confirm(`Удалить организацию «${org.name}»? Это действие нельзя отменить.`)) return;
        try {
            const { error } = await supabase.from('organizations').delete().eq('id', org.id);
            if (error) throw error;
            auditLog.log(
                user?.email || 'unknown',
                profile?.role || 'unknown',
                'delete',
                'organization',
                org.name,
                `Удалена организация ${org.name}`,
                org.id
            );
            addToast({ type: 'success', title: 'Удалено', message: 'Организация удалена' });
            await loadOrganizations();
            await refreshOrganizations();
        } catch (err) {
            addToast({ type: 'danger', title: 'Ошибка', message: `Не удалось удалить: ${err}` });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">Организации</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Создавайте и управляйте учреждениями образования
                    </p>
                </div>
                <button
                    onClick={openCreate}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors"
                >
                    <Icon name="Plus" size={18} />
                    Добавить организацию
                </button>
            </div>

            {loading ? (
                <div className="text-center py-12 text-slate-500">Загрузка...</div>
            ) : organizations.length === 0 ? (
                <div className="text-center py-12 bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                    <Icon name="Building2" size={48} className="mx-auto mb-3 text-slate-300" />
                    <p className="text-slate-500">Организаций пока нет</p>
                </div>
            ) : (
                <div className="bg-white dark:bg-dark-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                <tr>
                                    <th className="px-4 py-3 font-semibold">Название</th>
                                    <th className="px-4 py-3 font-semibold">Тип</th>
                                    <th className="px-4 py-3 font-semibold">Город</th>
                                    <th className="px-4 py-3 font-semibold">Статус</th>
                                    <th className="px-4 py-3 font-semibold text-right">Действия</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {organizations.map((org) => (
                                    <tr key={org.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-slate-800 dark:text-slate-100">{org.name}</div>
                                            {org.address && (
                                                <div className="text-xs text-slate-500">{org.address}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300 capitalize">{org.type}</td>
                                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{org.city || '—'}</td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                                    org.isActive
                                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                                                        : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                                                }`}
                                            >
                                                {org.isActive ? 'Активна' : 'Заблокирована'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="inline-flex items-center gap-2">
                                                <button
                                                    onClick={() => openEdit(org)}
                                                    className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                    title="Редактировать"
                                                >
                                                    <Icon name="Edit2" size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(org)}
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
            )}

            <Modal isOpen={isModalOpen} onClose={closeModal} title={editingOrg ? 'Редактировать организацию' : 'Новая организация'} maxWidth="max-w-lg">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Название *</label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-dark-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                            required
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Тип</label>
                            <select
                                value={form.type}
                                onChange={(e) => setForm({ ...form, type: e.target.value })}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-dark-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="gymnasium">Гимназия</option>
                                <option value="school">Школа</option>
                                <option value="kindergarten">Детский сад</option>
                                <option value="college">Колледж</option>
                                <option value="other">Другое</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Город</label>
                            <input
                                type="text"
                                value={form.city}
                                onChange={(e) => setForm({ ...form, city: e.target.value })}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-dark-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Адрес</label>
                        <input
                            type="text"
                            value={form.address}
                            onChange={(e) => setForm({ ...form, address: e.target.value })}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-dark-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Email для связи</label>
                        <input
                            type="email"
                            value={form.contactEmail}
                            onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-dark-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            id="org-is-active"
                            type="checkbox"
                            checked={form.isActive}
                            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <label htmlFor="org-is-active" className="text-sm text-slate-700 dark:text-slate-300">Активна</label>
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
                            {editingOrg ? 'Сохранить' : 'Создать'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};
