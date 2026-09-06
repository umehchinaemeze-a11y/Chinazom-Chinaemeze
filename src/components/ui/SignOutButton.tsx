"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./Button";

export function SignOutButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } finally {
      router.push("/signin");
      router.refresh();
    }
  };

  return (
    <Button
      variant="outline"
      isLoading={isLoading}
      onClick={handleSignOut}
      className="w-auto px-6"
    >
      Sign Out
    </Button>
  );
}
