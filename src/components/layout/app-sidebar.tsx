
"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquare, Settings, SlidersHorizontal, PanelLeft, Video, ClipboardCheck, Wrench, FileClock, BookCopy, PanelRight, Download, Archive } from 'lucide-react';
import { FeedbackDialog } from '@/components/feedback-dialog';
import { useMemo } from 'react';

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarFooter,
  useSidebar,
  SidebarGroup,
  SidebarGroupLabel,
} from '@/components/ui/sidebar';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';
import { ScrollArea } from '../ui/scroll-area';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection } from 'firebase/firestore';
import type { AuthorizedUser } from '@/lib/types';


export function AppSidebar() {
  const pathname = usePathname();
  const { toggleSidebar, state } = useSidebar();
  const firestore = useFirestore();
  const { user } = useUser();

  const { data: authorizedUsers, isLoading: isLoadingAuthorizedUsers } = useCollection<AuthorizedUser>(useMemoFirebase(() => firestore ? collection(firestore, 'authorizedUsers') : null, [firestore]));

  const isUserAuthorized = useMemo(() => {
    if (!user || !authorizedUsers) return false;
    return authorizedUsers.some(authUser => authUser.email === user.email);
  }, [user, authorizedUsers]);


  const csHelpfulLinks = [
      { href: 'https://app.hubspot.com/contacts/413765/objects/0-3/views/46386418/list', icon: FileClock, label: 'Contracts Ending EOM'},
      { href: 'https://app.hubspot.com/contacts/413765/objects/0-3/views/52145952/list', icon: FileClock, label: 'Active Contracts'},
      { href: 'https://us-west-2b.online.tableau.com/t/fieldagentincinternal/views/StoresightContractCompliance/ContractCompliance', icon: ClipboardCheck, label: 'Contract Compliance' },
  ];

  const opsResourcesLinks = [
      { href: '/code-directory', icon: BookCopy, label: 'Master Code Directory' },
      { href: 'https://studio--store-list-builder2.us-central1.hosted.app/', icon: Download, label: 'Retail List Downloader' },
      { href: 'https://app.shelfgram.com/admin-portal/private_spaces', icon: Settings, label: 'Storesight Admin Portal' },
      { href: 'https://my.fieldagent.net/admin/shelfgram/suite/', icon: Wrench, label: 'Admin - Suites' },
  ];


  return (
    <Sidebar>
      <SidebarContent>
        <ScrollArea className="h-full">
            <div className="space-y-0 pt-4">
                <SidebarGroup className="p-1.5 pb-0">
                    <SidebarGroupLabel className="px-2">Quick access</SidebarGroupLabel>
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild size="sm" tooltip="Review Submitted Orders" className="justify-start" isActive={pathname.startsWith('/all-orders')}>
                                <Link href="/all-orders">
                                    <Archive className="h-4 w-4" />
                                    <span className="whitespace-normal leading-normal">Review Submitted Orders</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarGroup>
                <SidebarGroup className="p-1.5 pt-0">
                    <SidebarGroupLabel className="px-2">CS Helpful Links</SidebarGroupLabel>
                    <SidebarMenu>
                        {csHelpfulLinks.map((item) => (
                        <SidebarMenuItem key={item.label}>
                            <SidebarMenuButton asChild size="sm" tooltip={item.label} className="justify-start">
                                <Link href={item.href} target={item.href.startsWith('http') ? '_blank' : '_self'}>
                                    <item.icon className="h-4 w-4" />
                                    <span className="whitespace-normal leading-normal">{item.label}</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                        ))}
                    </SidebarMenu>
                </SidebarGroup>
                <SidebarGroup className="p-1.5">
                    <SidebarGroupLabel className="px-2">Ops Resources</SidebarGroupLabel>
                     <SidebarMenu>
                        {opsResourcesLinks.map((item) => (
                        <SidebarMenuItem key={item.label}>
                            <SidebarMenuButton asChild size="sm" tooltip={item.label} className="justify-start" isActive={pathname.startsWith(item.href)}>
                                <Link href={item.href} target={item.href.startsWith('http') ? '_blank' : '_self'}>
                                    <item.icon className="h-4 w-4" />
                                    <span className="whitespace-normal leading-normal">{item.label}</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                        ))}
                    </SidebarMenu>
                </SidebarGroup>
            </div>
        </ScrollArea>
      </SidebarContent>
       <SidebarFooter className="mt-auto">
         <SidebarSeparator/>
        <SidebarMenu>
            <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Training Video" className="border" size="sm">
                     <Link href="https://www.loom.com/share/97510bf52b04407e8b16c3376fb10f92?sid=97cb4f95-7c5a-444c-a8fb-c9e82a87b97f" target="_blank">
                        <Video />
                        <span>Loom Training Video</span>
                    </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith('/admin-console')}
                tooltip="Admin Console"
                className="border"
                size="sm"
                disabled={!isUserAuthorized}
                aria-disabled={!isUserAuthorized}
              >
                <Link href="/admin-console" aria-disabled={!isUserAuthorized} tabIndex={isUserAuthorized ? undefined : -1}>
                  <SlidersHorizontal />
                  <span>Admin Console</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          <SidebarMenuItem>
            <FeedbackDialog>
              <SidebarMenuButton tooltip="Give Feedback" className="border" size="sm">
                <MessageSquare />
                <span>Give Feedback</span>
              </SidebarMenuButton>
            </FeedbackDialog>
          </SidebarMenuItem>
            <SidebarMenuItem>
                <SidebarMenuButton
                    onClick={toggleSidebar}
                    tooltip={state === 'expanded' ? 'Collapse Panel' : 'Collapse Panel'}
                    className="hidden md:flex justify-center"
                    variant="outline"
                    size="sm"
                    >
                    {state === 'expanded' ? <PanelLeft /> : <PanelRight />}
                    <span className="group-data-[collapsible=icon]:hidden">{state === 'expanded' ? 'Collapse Panel' : 'Expand Panel'}</span>
                </SidebarMenuButton>
            </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
