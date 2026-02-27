import { create } from "zustand";
import { PERMISSIONS_BY_ROLE } from "../constants/permissions";
import type { Role, User } from "../types/roles";
import { FRONTEND_TEXT } from "../text";

type UserStore = {
  user: User;
  setRole: (role: Role) => void;
  setName: (name: string) => void;
  setMaterias: (materias: string[]) => void;
  setQuota: (quota: number) => void;
};

const defaultUser: User = {
  id: FRONTEND_TEXT.defaults.user.id,
  name: FRONTEND_TEXT.defaults.user.name,
  role: FRONTEND_TEXT.defaults.user.role,
  permissions: PERMISSIONS_BY_ROLE.basic,
  materias: [...FRONTEND_TEXT.defaults.user.materias],
  dateAccess: {},
  quota: FRONTEND_TEXT.defaults.user.quota
};

export const useUserStore = create<UserStore>((set) => ({
  user: defaultUser,
  setRole: (role) =>
    set((state) => ({
      user: {
        ...state.user,
        role,
        permissions: PERMISSIONS_BY_ROLE[role]
      }
    })),
  setName: (name) =>
    set((state) => ({
      user: {
        ...state.user,
        name
      }
    })),
  setMaterias: (materias) =>
    set((state) => ({
      user: {
        ...state.user,
        materias
      }
    })),
  setQuota: (quota) =>
    set((state) => ({
      user: {
        ...state.user,
        quota
      }
    }))
}));
