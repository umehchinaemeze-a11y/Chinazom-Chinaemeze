import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SignOutButton } from "@/components/ui";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/signin");
  }

  return (
    <main className="min-h-screen bg-background p-xl md:p-2xl">
      <div className="max-w-3xl mx-auto">
        <header className="flex flex-col items-start gap-base pb-xl border-b border-outline-variant sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-headline-large text-on-surface">Dashboard</h1>
            <p className="text-body-medium text-on-surface-variant mt-sm">
              Welcome to your authenticated session.
            </p>
          </div>
          <SignOutButton />
        </header>

        <section
          aria-labelledby="account-details-heading"
          className="mt-xl bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-soft p-xl sm:p-2xl"
        >
          <h2
            id="account-details-heading"
            className="text-label-small uppercase tracking-wider text-on-surface-variant"
          >
            Account Details
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-xl sm:gap-x-2xl mt-lg">
            <div className="min-w-0">
              <dt className="text-label-medium text-on-surface-variant">Full Name</dt>
              <dd className="text-body-large text-on-surface break-words mt-sm">
                {user.name}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-label-medium text-on-surface-variant">Email Address</dt>
              <dd className="text-body-large text-on-surface break-words mt-sm">
                {user.email}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  );
}