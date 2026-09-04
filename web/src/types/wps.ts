export interface WpsContact {
  id: string;
  name: string;
  nick_name?: string;
  user_name?: string;
  email?: string;
  avatar_url?: string;
  department?: string;
  status?: string;
}

export interface WpsChat {
  id: string;
  type: string;
  name: string;
  status?: string;
}

export interface WpsDocument {
  id: string;
  name: string;
  type?: string;
  link_id?: string;
  link_url?: string;
  drive_id?: string;
  modified_time?: string;
}

export function wpsContactLabel(contact: WpsContact): string {
  return contact.name || contact.user_name || contact.nick_name || contact.id;
}

export function wpsDocumentHref(doc: WpsDocument): string | undefined {
  return doc.link_url || undefined;
}
