"use client";
import { createContext, useContext } from "react";
import type { Member } from "@/lib/types";

const MembersContext = createContext<Member[]>([]);
export const MembersProvider = MembersContext.Provider;
export const useMembers = () => useContext(MembersContext);
