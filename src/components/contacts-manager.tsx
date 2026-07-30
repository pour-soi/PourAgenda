"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { CONTACT_PAGE_SIZE, contactError, contactInput, escapePostgrestSearch } from "@/lib/contacts";
import { createClient } from "@/lib/supabase/client";
import type { Contact } from "@/types/domain";

type Draft = { name: string; phone: string; email: string; organization: string; notes: string };
const blank: Draft = { name: "", phone: "", email: "", organization: "", notes: "" };

export function ContactsManager({ userId, initialRows }: { userId: string; initialRows: Contact[] }) {
  const supabase = createClient();
  const [rows, setRows] = useState(initialRows.slice(0, CONTACT_PAGE_SIZE));
  const [hasMore, setHasMore] = useState(initialRows.length > CONTACT_PAGE_SIZE);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState(blank);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function load(reset = true) {
    const term = escapePostgrestSearch(query);
    let request = supabase.from("contacts").select("*").eq("user_id", userId)
      .order("name").order("id").range(reset ? 0 : rows.length, (reset ? 0 : rows.length) + CONTACT_PAGE_SIZE);
    if (term) request = request.or(`name.ilike.%${term}%,organization.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
    const result = await request;
    if (result.error) return setMessage("Contacts could not be loaded.");
    const page = (result.data ?? []).slice(0, CONTACT_PAGE_SIZE) as Contact[];
    setRows(reset ? page : [...rows, ...page.filter((item) => !rows.some((row) => row.id === item.id))]);
    setHasMore((result.data?.length ?? 0) > CONTACT_PAGE_SIZE);
    if (!page.length && reset) setMessage(term ? "No contacts match your search." : "");
  }

  function edit(contact?: Contact) {
    setEditing(contact ?? null);
    setFormOpen(true);
    setDraft(contact ? { name: contact.name, phone: contact.phone ?? "", email: contact.email ?? "",
      organization: contact.organization ?? "", notes: contact.notes ?? "" } : blank);
    setMessage("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const parsed = contactInput.safeParse(draft);
    if (!parsed.success) return setMessage(parsed.error.issues[0]?.message ?? "Check the contact.");
    setPending(true);
    const values = { ...parsed.data, user_id: userId, phone: parsed.data.phone || null,
      email: parsed.data.email || null, organization: parsed.data.organization || null, notes: parsed.data.notes || null };
    const result = editing
      ? await supabase.from("contacts").update(values).eq("id", editing.id)
        .eq("updated_at", editing.updated_at).select("*").maybeSingle()
      : await supabase.from("contacts").insert(values).select("*").single();
    setPending(false);
    if (result.error) return setMessage(contactError(result.error));
    if (!result.data) return setMessage("This contact changed elsewhere. Reload the latest version before saving.");
    await supabase.from("appointment_activity").insert({
      user_id: userId, appointment_id: null, action: editing ? "contact_updated" : "contact_created",
    });
    setEditing(null); setFormOpen(false); setDraft(blank);
    setMessage(editing ? "Contact updated." : "Contact created.");
    await load();
  }

  async function remove(contact: Contact) {
    if (!window.confirm(`Delete ${contact.name}? Linked appointments will be kept.`)) return;
    const result = await supabase.from("contacts").delete().eq("id", contact.id)
      .eq("updated_at", contact.updated_at).select("id").maybeSingle();
    if (result.error) return setMessage(contactError(result.error));
    if (!result.data) return setMessage("This contact changed elsewhere. Reload before deleting.");
    await supabase.from("appointment_activity").insert({ user_id: userId, appointment_id: null, action: "contact_deleted" });
    setRows((current) => current.filter((item) => item.id !== contact.id));
    setMessage("Contact deleted. Linked appointments were kept.");
  }

  return <main className="safe-bottom min-h-dvh bg-background p-4 sm:p-8">
    <div className="mx-auto max-w-4xl">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-primary"><ArrowLeft size={18}/>Calendar</Link>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-3xl font-semibold">Contacts</h1><p className="mt-1 text-muted">Private contacts for your appointments.</p></div>
        <button onClick={() => edit()} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-white"><Plus size={18}/>New contact</button>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); void load(); }} className="mt-6 flex gap-2">
        <label className="sr-only" htmlFor="contact-search">Search contacts</label>
        <input id="contact-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, company, phone, or email" className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3"/>
        <button className="rounded-lg border border-border px-4">Search</button>
      </form>
      {message && <p role="status" className="mt-4 rounded-lg border border-border bg-surface p-3">{message}</p>}
      <div className="mt-5 grid gap-3">
        {rows.map((contact) => <article key={contact.id} className="rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-semibold">{contact.name}</h2>
            {contact.organization && <p className="text-sm text-muted">{contact.organization}</p>}
            <p className="mt-2 text-sm">{[contact.phone, contact.email].filter(Boolean).join(" · ") || "No phone or email"}</p>
          </div><div className="flex gap-2"><button onClick={() => edit(contact)} className="min-h-11 rounded-lg border border-border px-3">Edit</button>
            <button onClick={() => void remove(contact)} aria-label={`Delete ${contact.name}`} className="min-h-11 rounded-lg border border-red-700 px-3 text-red-700"><Trash2 size={18}/></button></div></div>
          {contact.notes && <p className="mt-3 whitespace-pre-wrap text-sm">{contact.notes}</p>}
        </article>)}
      </div>
      {hasMore && <button onClick={() => void load(false)} className="mt-5 w-full rounded-lg border border-border px-4">Load more</button>}
      {formOpen ? <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label={editing ? "Edit contact" : "Create contact"}>
        <form onSubmit={save} className="mx-auto max-w-xl space-y-4 rounded-xl bg-surface p-5 sm:p-7">
          <h2 className="text-xl font-semibold">{editing ? "Edit contact" : "New contact"}</h2>
          <label className="block">Name<input autoFocus required value={draft.name} onChange={(e) => setDraft({...draft,name:e.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background px-3"/></label>
          <label className="block">Phone<input type="tel" value={draft.phone} onChange={(e) => setDraft({...draft,phone:e.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background px-3"/></label>
          <label className="block">Email<input type="email" value={draft.email} onChange={(e) => setDraft({...draft,email:e.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background px-3"/></label>
          <label className="block">Company or organization<input value={draft.organization} onChange={(e) => setDraft({...draft,organization:e.target.value})} className="mt-1 w-full rounded-lg border border-border bg-background px-3"/></label>
          <label className="block">Notes<textarea value={draft.notes} onChange={(e) => setDraft({...draft,notes:e.target.value})} className="mt-1 min-h-28 w-full rounded-lg border border-border bg-background p-3"/></label>
          <div className="flex gap-2"><button disabled={pending} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-white disabled:opacity-60"><Save size={18}/>{pending ? "Saving…" : "Save contact"}</button>
            <button type="button" onClick={() => { setEditing(null); setFormOpen(false); setDraft(blank); }} className="rounded-lg border border-border px-4">Cancel</button></div>
        </form></div> : null}
    </div>
  </main>;
}
