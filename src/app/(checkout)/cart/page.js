"use client";

import { useCart } from "@/constants/CartContext";
import Container from "@/components/ui/Container";
import CartItem from "@/components/cart/CartItem";
import CartSummary from "@/components/cart/CartSummary";
import EmptyCart from "@/components/cart/EmptyCart";
import Link from "next/link";
import { ArrowLeft, ShoppingBag } from "lucide-react";

export default function CartPage() {
  const { cartItems, availabilityById, availabilityReady, removeFromCart, updateQuantity, subtotal } = useCart();

  return (
    <div className="flex min-h-screen w-full min-w-0 flex-col bg-[var(--color-background)] py-8 sm:py-16">
      <Container className="max-w-[1400px]">
        
        {/* Breadcrumb / Back Link */}
        <div className="mb-8">
          <Link href="/shop" className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors">
            <ArrowLeft className="h-4 w-4" /> Continue Shopping
          </Link>
        </div>

        <div className="mb-6 flex min-w-0 items-center gap-3 sm:mb-8">
          <ShoppingBag className="h-7 w-7 text-[var(--color-primary)]" />
          <h1 className="min-w-0 break-words font-editorial text-2xl font-bold text-[var(--color-text)] sm:text-4xl">
            Shopping Bag ({cartItems.reduce((acc, item) => acc + item.quantity, 0)})
          </h1>
        </div>

        {cartItems.length > 0 ? (
          <div className="grid min-w-0 grid-cols-1 items-start gap-5 lg:min-w-[960px] lg:grid-cols-12 lg:gap-12">
            
            {/* Cart Items List (8 cols) */}
            <div className="min-w-0 space-y-4 lg:col-span-8">
              {cartItems.map((item) => (
                <CartItem 
                  key={item.id} 
                  item={item} 
                  availabilityStatus={availabilityReady ? availabilityById[item.id] : "checking"}
                  onUpdateQuantity={updateQuantity} 
                  onRemove={removeFromCart} 
                />
              ))}
            </div>

            {/* Cart Summary Card (4 cols) */}
          <div className="min-w-0 lg:col-span-4">
              <CartSummary subtotal={subtotal} />
            </div>

          </div>
        ) : (
          <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-12 text-center">
            <EmptyCart />
          </div>
        )}

      </Container>
    </div>
  );
}
