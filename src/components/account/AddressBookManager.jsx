"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { deleteCustomerAddress, saveCustomerAddress, setDefaultCustomerAddress } from "@/app/(account)/actions";

const inputClassName = "min-h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text)] focus:border-[var(--color-rose)] focus:outline-none focus:ring-2 focus:ring-[var(--color-rose)]/20";

function AddressField({ id, name, label, value, required = true, type = "text", autoComplete, maxLength }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-[var(--color-text)]">{label}</label>
      <input id={id} name={name} type={type} defaultValue={value ?? ""} required={required} autoComplete={autoComplete} maxLength={maxLength} className={inputClassName} />
    </div>
  );
}

function AddressFields({ prefix, address = {} }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <AddressField id={`${prefix}-recipient`} name="recipientName" label="Recipient name" value={address.recipient_name} autoComplete="name" maxLength={160} />
      <AddressField id={`${prefix}-phone`} name="phone" label="Phone number" value={address.phone} type="tel" autoComplete="tel" maxLength={40} />
      <AddressField id={`${prefix}-governorate`} name="governorate" label="Governorate" value={address.governorate} autoComplete="address-level1" maxLength={120} />
      <AddressField id={`${prefix}-city`} name="city" label="City" value={address.city} autoComplete="address-level2" maxLength={120} />
      <div className="sm:col-span-2">
        <AddressField id={`${prefix}-address`} name="addressLine" label="Address" value={address.address_line} autoComplete="street-address" maxLength={1000} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${prefix}-notes`} className="mb-1.5 block text-xs font-semibold text-[var(--color-text)]">Delivery notes <span className="font-normal text-[var(--color-text-secondary)]">(optional)</span></label>
        <textarea id={`${prefix}-notes`} name="deliveryNotes" defaultValue={address.delivery_notes ?? ""} maxLength={1000} rows={3} className={`${inputClassName} resize-y`} />
      </div>
    </div>
  );
}

export default function AddressBookManager({ addresses }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState(null);

  function submit(event, action, resetOnSuccess = false) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await action(formData);
        setMessage(result);
        if (result.ok) {
          if (resetOnSuccess) form.reset();
          router.refresh();
        }
      } catch {
        setMessage({ ok: false, message: "The address could not be saved. Please try again." });
      }
    });
  }

  function setDefault(addressId) {
    const formData = new FormData();
    formData.set("addressId", addressId);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await setDefaultCustomerAddress(formData);
        setMessage(result);
        if (result.ok) router.refresh();
      } catch {
        setMessage({ ok: false, message: "The default address could not be changed. Please try again." });
      }
    });
  }

  function removeAddress(address) {
    if (!window.confirm(`Delete the address for ${address.recipient_name}?`)) return;
    const formData = new FormData();
    formData.set("addressId", address.id);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await deleteCustomerAddress(formData);
        setMessage(result);
        if (result.ok) router.refresh();
      } catch {
        setMessage({ ok: false, message: "The address could not be deleted. Please try again." });
      }
    });
  }

  return (
    <div className="space-y-6" aria-busy={pending}>
      {message && <p role={message.ok ? "status" : "alert"} className={`rounded-xl border px-4 py-3 text-sm ${message.ok ? "border-[var(--color-border)] bg-[var(--color-primary-light)] text-[var(--color-text)]" : "border-red-200 bg-red-50 text-red-800"}`}>{message.message}</p>}

      <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-7">
        <div className="mb-5">
          <h2 className="font-editorial text-2xl font-semibold text-[var(--color-text)]">Add an address</h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Save a delivery destination for your next order.</p>
        </div>
        <form onSubmit={(event) => submit(event, saveCustomerAddress, true)} className="space-y-5">
          <AddressFields prefix="new-address" />
          <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--color-text-secondary)]">
            <input type="checkbox" name="isDefault" value="true" className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]" />
            Make this my default address
          </label>
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save address"}</Button>
        </form>
      </section>

      <section aria-labelledby="saved-addresses-title" className="space-y-4">
        <div>
          <h2 id="saved-addresses-title" className="font-editorial text-2xl font-semibold text-[var(--color-text)]">Saved addresses</h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Each address can have its own delivery contact number.</p>
        </div>
        {addresses.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-7 text-sm text-[var(--color-text-secondary)]">Your address book is empty. Add your first delivery address above.</div>
        ) : (
          <div className="space-y-4">
            {addresses.map((address) => (
              <article key={address.id} className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-7">
                <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-[var(--color-text)]">{address.recipient_name}</h3>
                    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{address.city}, {address.governorate}</p>
                  </div>
                  {address.is_default && <span className="rounded-full bg-[var(--color-primary-light)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-rose)]">Default</span>}
                </header>
                <form onSubmit={(event) => submit(event, saveCustomerAddress)} className="space-y-5">
                  <input type="hidden" name="addressId" value={address.id} />
                  <AddressFields prefix={`address-${address.id}`} address={address} />
                  <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--color-text-secondary)]">
                    <input type="checkbox" name="isDefault" value="true" defaultChecked={address.is_default} className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]" />
                    Make this my default address
                  </label>
                  <div className="flex flex-wrap gap-3 border-t border-[var(--color-border)] pt-4">
                    <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
                    {!address.is_default && <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setDefault(address.id)}>Set as default</Button>}
                    <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => removeAddress(address)}>Delete</Button>
                  </div>
                </form>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
