import React, { Suspense, lazy } from 'react';
import { BookOpen, Beaker } from 'lucide-react';
import Header from '@/components/Header';
import EducatorChapters from '@/components/educator/EducatorChapters';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SEOHead from '@/components/SEOHead';
import { Skeleton } from '@/components/ui/skeleton';

// Lazy — three.js (~600KB) loads only when the Simulations tab is opened.
const VirtualLab = lazy(() => import('@/components/virtual-lab/VirtualLab'));

const ProPlusLibraryPage: React.FC = () => {
  return (
    <div className="mobile-app-shell bg-background">
      <SEOHead
        title="JEEnie Pro+ Library"
        description="View educator presentations and Interactive Animations with JEEnie Pro+."
        noIndex
      />
      <Header />

      <div className="mobile-app-shell-content">
        <div className="container mx-auto px-4 sm:px-6 lg:px-10 xl:px-12 py-6 space-y-5">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">JEEnie Pro+ Visual Learning Library</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Access educator presentations and Interactive Animations in secure, view-only mode.
            </p>
          </div>

          <Tabs defaultValue="presentations" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 h-auto p-1">
              <TabsTrigger value="presentations" className="gap-2 py-2.5">
                <BookOpen className="h-4 w-4" /> Presentations
              </TabsTrigger>
              <TabsTrigger value="simulations" className="gap-2 py-2.5">
                <Beaker className="h-4 w-4" /> Interactive Animations
              </TabsTrigger>
            </TabsList>

            <TabsContent value="presentations" className="space-y-4">
              <EducatorChapters />
            </TabsContent>

            <TabsContent value="simulations" className="space-y-4">
              <Suspense fallback={<Skeleton className="h-[480px] w-full rounded-2xl" />}>
                <VirtualLab />
              </Suspense>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default ProPlusLibraryPage;
