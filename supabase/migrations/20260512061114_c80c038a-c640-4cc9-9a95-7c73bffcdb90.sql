
CREATE OR REPLACE FUNCTION public.enforce_session_item_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock INTEGER;
  v_name TEXT;
  v_reserved INTEGER;
  v_old_qty INTEGER := 0;
  v_delta INTEGER;
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_qty := COALESCE(OLD.qty, 0);
    -- Only validate if qty grew or product changed
    IF NEW.product_id = OLD.product_id AND NEW.qty <= OLD.qty THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Lock the product row to serialize concurrent reservations
  SELECT stock, name INTO v_stock, v_name
  FROM public.products
  WHERE id = NEW.product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  -- Sum reserved qty across active sessions, excluding this row if updating
  SELECT COALESCE(SUM(si.qty), 0) INTO v_reserved
  FROM public.session_items si
  JOIN public.sessions s ON s.id = si.session_id
  WHERE si.product_id = NEW.product_id
    AND s.status = 'active'
    AND (TG_OP <> 'UPDATE' OR si.id <> OLD.id);

  v_delta := NEW.qty;

  IF v_reserved + v_delta > v_stock THEN
    RAISE EXCEPTION 'Insufficient stock for "%": only % available (% already reserved in active sessions)',
      v_name, v_stock, v_reserved;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_session_item_stock ON public.session_items;
CREATE TRIGGER trg_enforce_session_item_stock
BEFORE INSERT OR UPDATE ON public.session_items
FOR EACH ROW
EXECUTE FUNCTION public.enforce_session_item_stock();
