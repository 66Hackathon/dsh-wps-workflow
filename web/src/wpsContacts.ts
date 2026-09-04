import { api } from './api/client';
import { DEFAULT_MEMBER_ROLE } from './memberRoles';
import type { WpsContact } from './types/wps';
import { wpsContactLabel } from './types/wps';

export async function ensureWpsContacts(contacts: WpsContact[]) {
  const res = await api.ensureWpsContacts(
    contacts.map((contact) => ({
      wps_user_id: contact.id,
      name: wpsContactLabel(contact),
      nick_name: contact.nick_name,
      email: contact.email,
      avatar_url: contact.avatar_url,
    })),
  );
  return res.items ?? [];
}

export async function addWpsContactsToProject(projectId: number, contacts: WpsContact[]) {
  const users = await ensureWpsContacts(contacts);
  for (const user of users) {
    try {
      await api.addProjectMember(projectId, {
        user_id: user.id,
        role_codes: [DEFAULT_MEMBER_ROLE],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (!message.includes('already') && !message.includes('duplicate')) {
        throw err;
      }
    }
  }
  return users;
}
