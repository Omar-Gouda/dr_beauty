import { Suspense } from "react";
import { connection } from "next/server";
import Navbar from "@/components/layout/Navbar";
import { createClient } from "@/lib/supabase/server";
import { getMissingSupabaseEnv } from "@/lib/supabase/config";

async function ResolvedNavbar(props) {
  await connection();
  let initialAuthenticated = false;
  if (getMissingSupabaseEnv().length === 0) {
    try {
      const supabase = await createClient();
      const { data: { user }, error } = await supabase.auth.getUser();
      initialAuthenticated = !error && Boolean(user);
    } catch {
      initialAuthenticated = false;
    }
  }

  return <Navbar {...props} initialAuthenticated={initialAuthenticated} />;
}

export default function SessionAwareNavbar(props) {
  return <Suspense fallback={<Navbar {...props} initialAuthenticated={null} />}>
    <ResolvedNavbar {...props} />
  </Suspense>;
}
