'use client';

import { createContext, useContext } from 'react';

// Shared state/actions for the customer menu, provided by MenuProvider and consumed
// by the screen components via useMenu().
export const MenuContext = createContext(null);

export const useMenu = () => useContext(MenuContext);
