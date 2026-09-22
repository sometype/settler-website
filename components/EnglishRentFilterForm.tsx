"use client";

import Form from "next/form";
import { useSearchParams } from "next/navigation";
import { useLayoutEffect, useRef, type ReactNode } from "react";

export function EnglishRentFilterForm({
  children,
  priceError,
}: {
  children: ReactNode;
  priceError?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const query = useSearchParams().toString();

  // Next restores cached pages on Back, including edits made before Search.
  // Restore the server-rendered defaults when a search is navigated to again.
  useLayoutEffect(() => {
    form.current?.reset();
  }, [query]);

  return (
    <Form
      ref={form}
      action="/en/rent"
      aria-describedby={priceError ? "price-error" : undefined}
      className="mt-6 grid gap-3 rounded-lg border border-sand bg-card p-4 sm:grid-cols-2 lg:grid-cols-5"
    >
      {children}
    </Form>
  );
}
