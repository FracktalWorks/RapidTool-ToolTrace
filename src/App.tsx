/**
 * ToolTrace Application
 * 
 * Client-side tool outline tracing application.
 * Workflow: Detect Paper → Trace Tools → Configure Layout → 3D Design → Export
 */

import { DashboardLayout, LoadingOverlay, type DashboardLayoutConfig } from '@rapidtool/cad-ui';
import { Header, ImageWorkspace, LayoutWorkspace, DesignWorkspace, ExportWorkspace, ControlPanel, Sidebar, ErrorBoundary } from './components';
import { useAppStore } from './stores';

// Layout configuration for DashboardLayout
const layoutConfig: Partial<DashboardLayoutConfig> = {
  header: {
    height: 56, // h-14
    visible: true,
  },
  sidebar: {
    width: 240,
    collapsible: true,
    collapsedWidth: 56,
    showCollapseButton: false, // We'll handle the title ourselves
    visible: true,
  },
  propertiesPanel: {
    enabled: true,
    width: 320, // w-80
    showCollapseButton: true,
  },
  footer: {
    visible: true,
    height: 24, // h-6
  },
};

const footerContent = (
  <div className="h-6 sidebar-glass flex items-center justify-between px-4 border-t border-[hsl(var(--border)/0.4)]">
    <div className="flex items-center gap-3 text-[10px] font-tech text-[hsl(var(--muted-foreground))]">
      <span className="flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--success))] inline-block" />
        Ready
      </span>
      <span className="text-[hsl(var(--border))]">•</span>
      <span>WebGL 2.0</span>
    </div>
    <span className="text-[10px] font-tech text-[hsl(var(--muted-foreground)/0.5)]">
      ToolTrace
    </span>
  </div>
);

// Step title mapping for properties panel
const stepTitles: Record<string, { title: string; subtitle: string }> = {
  paper: { title: 'Detect Paper', subtitle: 'Upload image & calibrate scale' },
  tools: { title: 'Trace Tools', subtitle: 'Click on tools to trace' },
  layout: { title: 'Configure Layout', subtitle: 'Arrange tool outlines' },
  design: { title: '3D Design', subtitle: 'Customize 3D design' },
  export: { title: 'Export', subtitle: 'Download your design' },
};

function App() {
  const { 
    isProcessing, 
    processingMessage,
    currentStep,
  } = useAppStore();

  // Render current workspace based on step
  const renderWorkspace = () => {
    switch (currentStep) {
      case 'layout':
        return <LayoutWorkspace />;
      case 'design':
        return <DesignWorkspace />;
      case 'export':
        return <ExportWorkspace />;
      default:
        return <ImageWorkspace />;
    }
  };

  return (
    <ErrorBoundary>
      <DashboardLayout
        config={layoutConfig}
        header={<Header />}
        sidebar={<Sidebar />}
        propertiesPanel={<ControlPanel />}
        propertiesPanelHeader={
          <div>
            <span className='font-semibold text-sm'>{stepTitles[currentStep]?.title || 'Properties'}</span>
            <p className='text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5'>{stepTitles[currentStep]?.subtitle}</p>
          </div>
        }
        footer={footerContent}
      >
        {/* Main Workspace */}
        <div className="h-full w-full overflow-hidden relative">
          <ErrorBoundary>
            {renderWorkspace()}
          </ErrorBoundary>
          
          {/* Loading Overlay - Only for main content */}
          <LoadingOverlay
            isVisible={isProcessing}
            message={processingMessage || 'Processing...'}
            positioning="absolute"
            type="import"
          />
        </div>
      </DashboardLayout>
    </ErrorBoundary>
  );
}

export default App;
