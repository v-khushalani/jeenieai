import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { logger } from "@/utils/logger";
import BrandEmptyState from "@/components/brand/BrandEmptyState";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    logger.warn(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="mobile-app-shell-bottom-nav bg-background">
      <div className="mobile-app-shell-content flex items-center justify-center">
        <BrandEmptyState
          preset="notFound"
          action={
            <Button asChild>
              <Link to="/">Wapas Home chalo</Link>
            </Button>
          }
        />
      </div>
    </div>
  );
};

export default NotFound;
