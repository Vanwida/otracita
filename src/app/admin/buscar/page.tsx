export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { db } from '@/db';
import { leads, clients, customers, invoices, bookings } from '@/db/schema';
import { ilike, or, eq, desc } from 'drizzle-orm';
import { Search } from 'lucide-react';
import {
  PageHeader,
  Section,
  Badge,
  EmptyState,
  TABLE_WRAPPER,
  TABLE,
  TABLE_HEAD,
  TABLE_HEAD_CELL,
  TABLE_BODY,
  TABLE_ROW,
  TABLE_CELL,
  formatDateTime,
} from '../_components/AdminUI';

/**
 * Búsqueda global cross-entidad. Pensada para responder rápido a "¿este
 * número de teléfono que me ha llamado quién es?": busca en paralelo en
 * leads, clientes, customers (clientes finales), facturas y reservas.
 *
 * Si la búsqueda parece un número de factura (formato libre con guiones o
 * dígitos), también intenta match exacto en `invoices.number`. Si no, hace
 * `ilike '%q%'` en cada tabla en los campos más probables.
 *
 * Cada bloque de resultados muestra hasta 30 filas para que la página no
 * explote en datasets grandes.
 */

const PER_BLOCK = 30;

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function AdminSearchPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const q = (sp.q || '').trim();

  // Sin query, mostramos solo el form
  if (q.length < 2) {
    return (
      <div className="p-8 md:p-12 max-w-5xl mx-auto relative z-10">
        <PageHeader
          title="Buscar"
          subtitle="Encuentra cualquier cosa en una sola consulta: leads, clientes, customers, facturas, reservas."
        />
        <SearchForm initialQ={q} />
        <div className="mt-12 rounded-2xl border border-line bg-surface p-12 text-center">
          <Search className="mx-auto h-12 w-12 text-ink-3 mb-4" />
          <p className="text-ink-2">Escribe al menos 2 caracteres para buscar.</p>
        </div>
      </div>
    );
  }

  const like = `%${q}%`;

  const [
    leadsRows,
    clientsRows,
    customersRows,
    invoicesRows,
    bookingsRows,
  ] = await Promise.all([
    db
      .select({
        id: leads.id,
        name: leads.name,
        businessName: leads.businessName,
        phone: leads.phone,
        email: leads.email,
        status: leads.status,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .where(
        or(
          ilike(leads.name, like),
          ilike(leads.businessName, like),
          ilike(leads.phone, like),
          ilike(leads.email, like),
          ilike(leads.notes, like),
        ),
      )
      .orderBy(desc(leads.createdAt))
      .limit(PER_BLOCK),

    db
      .select({
        id: clients.id,
        businessName: clients.businessName,
        ownerName: clients.ownerName,
        email: clients.email,
        phone: clients.phone,
        status: clients.status,
        tier: clients.tier,
      })
      .from(clients)
      .where(
        or(
          ilike(clients.businessName, like),
          ilike(clients.ownerName, like),
          ilike(clients.email, like),
          ilike(clients.phone, like),
          ilike(clients.publicSlug, like),
        ),
      )
      .orderBy(desc(clients.createdAt))
      .limit(PER_BLOCK),

    db
      .select({
        id: customers.id,
        clientId: customers.clientId,
        name: customers.name,
        phone: customers.phone,
        reputation: customers.reputation,
        totalBookings: customers.totalBookings,
        noShows: customers.noShows,
        businessName: clients.businessName,
      })
      .from(customers)
      .leftJoin(clients, eq(customers.clientId, clients.id))
      .where(or(ilike(customers.phone, like), ilike(customers.name, like)))
      .orderBy(desc(customers.lastBookingAt))
      .limit(PER_BLOCK),

    db
      .select({
        id: invoices.id,
        clientId: invoices.clientId,
        number: invoices.number,
        issueDate: invoices.issueDate,
        customerName: invoices.customerName,
        customerPhone: invoices.customerPhone,
        totalCents: invoices.totalCents,
        verifactuStatus: invoices.verifactuStatus,
        businessName: clients.businessName,
      })
      .from(invoices)
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .where(
        or(
          ilike(invoices.number, like),
          ilike(invoices.customerName, like),
          ilike(invoices.customerPhone, like),
          ilike(invoices.customerNif, like),
        ),
      )
      .orderBy(desc(invoices.issueDate))
      .limit(PER_BLOCK),

    db
      .select({
        id: bookings.id,
        clientId: bookings.clientId,
        customerPhone: bookings.customerPhone,
        customerName: bookings.customerName,
        date: bookings.date,
        time: bookings.time,
        service: bookings.service,
        status: bookings.status,
        businessName: clients.businessName,
      })
      .from(bookings)
      .leftJoin(clients, eq(bookings.clientId, clients.id))
      .where(or(ilike(bookings.customerPhone, like), ilike(bookings.customerName, like)))
      .orderBy(desc(bookings.createdAt))
      .limit(PER_BLOCK),
  ]);

  const totalResults =
    leadsRows.length + clientsRows.length + customersRows.length + invoicesRows.length + bookingsRows.length;

  return (
    <div className="p-8 md:p-12 max-w-6xl mx-auto relative z-10">
      <PageHeader
        title="Buscar"
        subtitle={
          <span>
            <span className="font-mono text-brand">{`"${q}"`}</span> →{' '}
            <span className="text-brand font-semibold">{totalResults}</span> resultado
            {totalResults === 1 ? '' : 's'}
          </span>
        }
      />
      <SearchForm initialQ={q} />

      {totalResults === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon={Search}
            title="Sin resultados."
            description="Prueba con menos caracteres o un fragmento (parte del teléfono, dominio del email, etc.)."
          />
        </div>
      ) : (
        <div className="mt-10 space-y-10">
          {clientsRows.length > 0 && (
            <Section title={`Clientes (${clientsRows.length})`}>
              <div className={TABLE_WRAPPER}>
                <table className={TABLE}>
                  <thead className={TABLE_HEAD}>
                    <tr>
                      <th className={TABLE_HEAD_CELL}>Negocio</th>
                      <th className={TABLE_HEAD_CELL}>Dueño</th>
                      <th className={TABLE_HEAD_CELL}>Email</th>
                      <th className={TABLE_HEAD_CELL}>Teléfono</th>
                      <th className={TABLE_HEAD_CELL}>Estado</th>
                      <th className={TABLE_HEAD_CELL}>Tier</th>
                      <th className={TABLE_HEAD_CELL}></th>
                    </tr>
                  </thead>
                  <tbody className={TABLE_BODY}>
                    {clientsRows.map((c) => (
                      <tr key={c.id} className={TABLE_ROW}>
                        <td className={`${TABLE_CELL} font-semibold text-ink`}>{c.businessName}</td>
                        <td className={`${TABLE_CELL} text-ink-2`}>{c.ownerName}</td>
                        <td className={`${TABLE_CELL} font-mono text-xs text-ink-2`}>{c.email}</td>
                        <td className={`${TABLE_CELL} font-mono text-xs text-ink-2`}>{c.phone}</td>
                        <td className={TABLE_CELL}>
                          <Badge tone={c.status === 'active' ? 'success' : 'warning'}>{c.status}</Badge>
                        </td>
                        <td className={`${TABLE_CELL} text-xs uppercase font-bold text-brand-strong`}>
                          {c.tier}
                        </td>
                        <td className={`${TABLE_CELL} text-right`}>
                          <Link
                            href={`/admin/clients/${c.id}`}
                            className="text-brand hover:underline text-xs font-semibold"
                          >
                            Abrir →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {leadsRows.length > 0 && (
            <Section title={`Leads (${leadsRows.length})`}>
              <div className={TABLE_WRAPPER}>
                <table className={TABLE}>
                  <thead className={TABLE_HEAD}>
                    <tr>
                      <th className={TABLE_HEAD_CELL}>Nombre</th>
                      <th className={TABLE_HEAD_CELL}>Negocio</th>
                      <th className={TABLE_HEAD_CELL}>Teléfono</th>
                      <th className={TABLE_HEAD_CELL}>Email</th>
                      <th className={TABLE_HEAD_CELL}>Estado</th>
                      <th className={TABLE_HEAD_CELL}>Creado</th>
                      <th className={TABLE_HEAD_CELL}></th>
                    </tr>
                  </thead>
                  <tbody className={TABLE_BODY}>
                    {leadsRows.map((l) => (
                      <tr key={l.id} className={TABLE_ROW}>
                        <td className={`${TABLE_CELL} font-semibold text-ink`}>{l.name}</td>
                        <td className={`${TABLE_CELL} text-ink-2`}>{l.businessName || '—'}</td>
                        <td className={`${TABLE_CELL} font-mono text-xs text-ink-2`}>{l.phone}</td>
                        <td className={`${TABLE_CELL} font-mono text-xs text-ink-2`}>{l.email || '—'}</td>
                        <td className={TABLE_CELL}>
                          <Badge tone={l.status === 'converted' ? 'success' : 'brand'}>{l.status}</Badge>
                        </td>
                        <td className={`${TABLE_CELL} text-xs text-ink-3`}>{formatDateTime(l.createdAt)}</td>
                        <td className={`${TABLE_CELL} text-right`}>
                          <Link
                            href={`/admin/leads/${l.id}`}
                            className="text-brand hover:underline text-xs font-semibold"
                          >
                            Abrir →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {customersRows.length > 0 && (
            <Section title={`Clientes finales / customers (${customersRows.length})`}>
              <div className={TABLE_WRAPPER}>
                <table className={TABLE}>
                  <thead className={TABLE_HEAD}>
                    <tr>
                      <th className={TABLE_HEAD_CELL}>Nombre</th>
                      <th className={TABLE_HEAD_CELL}>Teléfono</th>
                      <th className={TABLE_HEAD_CELL}>En barbería</th>
                      <th className={TABLE_HEAD_CELL}>Reservas</th>
                      <th className={TABLE_HEAD_CELL}>No-shows</th>
                      <th className={TABLE_HEAD_CELL}>Reputación</th>
                    </tr>
                  </thead>
                  <tbody className={TABLE_BODY}>
                    {customersRows.map((c) => (
                      <tr key={c.id} className={TABLE_ROW}>
                        <td className={`${TABLE_CELL} font-semibold text-ink`}>{c.name || '—'}</td>
                        <td className={`${TABLE_CELL} font-mono text-xs text-ink-2`}>{c.phone}</td>
                        <td className={TABLE_CELL}>
                          <Link
                            href={`/admin/clients/${c.clientId}`}
                            className="text-ink hover:text-brand transition-colors"
                          >
                            {c.businessName || <span className="italic text-ink-3">desconocido</span>}
                          </Link>
                        </td>
                        <td className={`${TABLE_CELL} font-mono text-ink`}>{c.totalBookings ?? 0}</td>
                        <td className={`${TABLE_CELL} font-mono ${(c.noShows ?? 0) > 0 ? 'text-warning' : 'text-ink-3'}`}>
                          {c.noShows ?? 0}
                        </td>
                        <td className={TABLE_CELL}>
                          <Badge
                            tone={
                              c.reputation === 'blocked' ? 'danger' : c.reputation === 'warning' ? 'warning' : 'success'
                            }
                          >
                            {c.reputation ?? 'good'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {invoicesRows.length > 0 && (
            <Section title={`Facturas (${invoicesRows.length})`}>
              <div className={TABLE_WRAPPER}>
                <table className={TABLE}>
                  <thead className={TABLE_HEAD}>
                    <tr>
                      <th className={TABLE_HEAD_CELL}>Nº</th>
                      <th className={TABLE_HEAD_CELL}>Barbería</th>
                      <th className={TABLE_HEAD_CELL}>Cliente</th>
                      <th className={TABLE_HEAD_CELL}>Fecha</th>
                      <th className={TABLE_HEAD_CELL}>VeriFactu</th>
                      <th className={`${TABLE_HEAD_CELL} text-right`}>Total</th>
                    </tr>
                  </thead>
                  <tbody className={TABLE_BODY}>
                    {invoicesRows.map((inv) => (
                      <tr key={inv.id} className={TABLE_ROW}>
                        <td className={`${TABLE_CELL} font-mono text-xs text-ink`}>{inv.number}</td>
                        <td className={TABLE_CELL}>
                          <Link
                            href={`/admin/clients/${inv.clientId}`}
                            className="text-ink hover:text-brand transition-colors"
                          >
                            {inv.businessName || <span className="italic text-ink-3">desconocido</span>}
                          </Link>
                        </td>
                        <td className={`${TABLE_CELL} text-ink-2`}>
                          {inv.customerName || '—'}{' '}
                          {inv.customerPhone && (
                            <span className="font-mono text-xs text-ink-3">· {inv.customerPhone}</span>
                          )}
                        </td>
                        <td className={`${TABLE_CELL} text-xs text-ink-2`}>{inv.issueDate}</td>
                        <td className={TABLE_CELL}>
                          <Badge
                            tone={
                              inv.verifactuStatus === 'accepted'
                                ? 'success'
                                : inv.verifactuStatus === 'rejected' || inv.verifactuStatus === 'error'
                                  ? 'danger'
                                  : 'warning'
                            }
                          >
                            {inv.verifactuStatus}
                          </Badge>
                        </td>
                        <td className={`${TABLE_CELL} text-right font-mono text-ink`}>
                          {(inv.totalCents / 100).toLocaleString('es-ES', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{' '}
                          €
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {bookingsRows.length > 0 && (
            <Section title={`Reservas (${bookingsRows.length})`}>
              <div className={TABLE_WRAPPER}>
                <table className={TABLE}>
                  <thead className={TABLE_HEAD}>
                    <tr>
                      <th className={TABLE_HEAD_CELL}>Cliente final</th>
                      <th className={TABLE_HEAD_CELL}>Teléfono</th>
                      <th className={TABLE_HEAD_CELL}>Barbería</th>
                      <th className={TABLE_HEAD_CELL}>Fecha</th>
                      <th className={TABLE_HEAD_CELL}>Hora</th>
                      <th className={TABLE_HEAD_CELL}>Servicio</th>
                      <th className={TABLE_HEAD_CELL}>Estado</th>
                    </tr>
                  </thead>
                  <tbody className={TABLE_BODY}>
                    {bookingsRows.map((b) => (
                      <tr key={b.id} className={TABLE_ROW}>
                        <td className={`${TABLE_CELL} font-semibold text-ink`}>{b.customerName || '—'}</td>
                        <td className={`${TABLE_CELL} font-mono text-xs text-ink-2`}>{b.customerPhone}</td>
                        <td className={TABLE_CELL}>
                          <Link
                            href={`/admin/clients/${b.clientId}`}
                            className="text-ink hover:text-brand transition-colors"
                          >
                            {b.businessName || <span className="italic text-ink-3">desconocido</span>}
                          </Link>
                        </td>
                        <td className={`${TABLE_CELL} text-xs text-ink-2`}>{b.date}</td>
                        <td className={`${TABLE_CELL} font-mono text-xs text-ink`}>{b.time}</td>
                        <td className={`${TABLE_CELL} text-ink-2`}>{b.service}</td>
                        <td className={TABLE_CELL}>
                          <Badge
                            tone={
                              b.status === 'completed'
                                ? 'success'
                                : b.status === 'cancelled' || b.status === 'no_show'
                                  ? 'danger'
                                  : 'brand'
                            }
                          >
                            {b.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function SearchForm({ initialQ }: { initialQ: string }) {
  return (
    <form method="get" className="flex gap-3">
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3" />
        <input
          type="text"
          name="q"
          defaultValue={initialQ}
          autoFocus
          placeholder="Teléfono, email, nombre, negocio, nº de factura…"
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-surface border border-line text-ink placeholder:text-ink-3 focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none text-sm transition-colors"
        />
      </div>
      <button
        type="submit"
        className="px-6 py-3 rounded-xl bg-brand text-brand-ink text-sm font-semibold transition-colors hover:bg-brand-strong"
      >
        Buscar
      </button>
    </form>
  );
}
