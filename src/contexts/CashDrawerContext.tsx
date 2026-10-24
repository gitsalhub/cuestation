import { createContext, useCallback, useContext, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface CashDrawerContextType {
  /** Signs out immediately; the former opening/closing cash popups are disabled. */
  requestSignOut: () => void;
}

const CashDrawerContext = createContext<CashDrawerContextType | undefined>(undefined);

/**
 * Cash Drawer data is now managed by the Cash Drawer page.
 * This provider remains in place so existing AppLayout logout buttons continue
 * to work, but it no longer forces opening-cash entry or closing-cash dialogs.
 */
export const CashDrawerProvider = ({ children }: { children: ReactNode }) => {
  const { signOut } = useAuth();

  const requestSignOut = useCallback(() => {
    void signOut();
  }, [signOut]);

  return (
    <CashDrawerContext.Provider value={{ requestSignOut }}>
      {children}
    </CashDrawerContext.Provider>
  );
};

export const useCashDrawer = () => {
  const ctx = useContext(CashDrawerContext);
  if (!ctx) throw new Error("useCashDrawer must be used within CashDrawerProvider");
  return ctx;
};
