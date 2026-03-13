"use client";

import { useMemo } from "react";
import { useAuth, handleSignOut, useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User as UserIcon } from "lucide-react";
import Link from "next/link";
import type { AuthorizedUser } from "@/lib/types";
import { collection } from "firebase/firestore";

export function UserNav({ variant = "dropdown" }: { variant?: "dropdown" | "header" }) {
  const { auth } = useAuth();
  const { user } = useUser();
  const firestore = useFirestore();

  const { data: authorizedUsers, isLoading: isLoadingAuthorizedUsers } = useCollection<AuthorizedUser>(
    useMemoFirebase(
      () => (firestore ? collection(firestore, "authorizedUsers") : null),
      [firestore]
    )
  );

  const isUserAuthorized = useMemo(() => {
    if (!user || !authorizedUsers) return false;
    return authorizedUsers.some((authUser) => authUser.email === user.email);
  }, [user, authorizedUsers]);

  if (!user) {
    return null;
  }

  const getInitials = (name: string | null | undefined) => {
    if (!name) return <UserIcon className="h-5 w-5" />;
    const [firstName, lastName] = name.split(" ");
    return firstName && lastName
      ? `${firstName.charAt(0)}${lastName.charAt(0)}`
      : firstName.charAt(0);
  };

  if (variant === "header") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-white truncate max-w-[140px]">
          {user.displayName || user.email || "User"}
        </span>
        {!isLoadingAuthorizedUsers && isUserAuthorized && (
          <Button
            variant="outline"
            size="sm"
            className="bg-white/90 text-[#4A2D8A] border-white/50 hover:bg-white hover:text-[#4A2D8A]"
            asChild
          >
            <Link href="/admin-console">Admin</Link>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="bg-white/90 text-[#4A2D8A] border-white/50 hover:bg-white hover:text-[#4A2D8A]"
          onClick={() => handleSignOut(auth)}
        >
          Sign Out
        </Button>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 w-9 rounded-full">
          <Avatar className="h-9 w-9">
            <AvatarImage src={user.photoURL ?? ""} alt={user.displayName ?? "User"} />
            <AvatarFallback>{getInitials(user.displayName)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.displayName}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleSignOut(auth)}>
            <LogOut className="mr-2" />
            Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
