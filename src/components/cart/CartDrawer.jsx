"use client";

import { useCart } from "@/constants/CartContext";
import EmptyCart from "./EmptyCart";
import CartItem from "./CartItem";
import { X, ShoppingBag } from "lucide-react";
import Link from "next/link";
import CartCheckoutButton from "@/components/cart/CartCheckoutButton";
import AccessibleDialog from "@/components/ui/AccessibleDialog";

export default function CartDrawer() {
  const { cartItems, availabilityById, availabilityReady, isCartOpen, setIsCartOpen, removeFromCart, updateQuantity, subtotal } = useCart();

  if (!isCartOpen) return null;

  return (
    <AccessibleDialog onClose={() => setIsCartOpen(false)} labelledBy="cart-drawer-title">
      <section className="ml-auto flex h-dvh min-h-0 w-full max-w-md flex-col bg-[var(--color-surface)] p-6 shadow-2xl" aria-label="Shopping bag">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-[var(--color-primary)]" />
            <h2 id="cart-drawer-title" className="font-editorial text-lg font-bold text-[var(--color-text)]">Your Shopping Bag</h2>
          </div>
          <button
            type="button"
            aria-label="Close shopping bag"
            onClick={() => setIsCartOpen(false)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Cart Items List or Empty State */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-5">
          {cartItems.length > 0 ? (
            cartItems.map((item) => (
              <CartItem 
                key={item.id} 
                item={item} 
                availabilityStatus={availabilityReady ? availabilityById[item.id] : "checking"}
                onUpdateQuantity={updateQuantity} 
                onRemove={removeFromCart} 
              />
            ))
          ) : (
            <EmptyCart onClose={() => setIsCartOpen(false)} />
          )}
        </div>

        {/* Footer & Checkout Action */}
        {cartItems.length > 0 && (
          <div className="space-y-4 border-t border-[var(--color-border)] pt-4 pb-6">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-text-secondary)]">Subtotal</span>
              <span className="font-bold text-[var(--color-text)]">EGP {subtotal}</span>
            </div>
            <p className="text-[11px] text-[var(--color-text-secondary)]">Shipping & taxes calculated at checkout.</p>

            <CartCheckoutButton href="/checkout" className="py-3.5" />
          </div>
        )}

      </section>
    </AccessibleDialog>
  );
}
