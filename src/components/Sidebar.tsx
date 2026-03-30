/**
 * Sidebar
 * 
 * Left sidebar with workflow navigation and user profile section.
 * Uses SidebarIcon components from @rapidtool/cad-ui package.
 * Collapse/expand is managed by DashboardLayout via useDashboardLayout().
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  FileText,
  Wrench,
  Download,
  LayoutGrid,
  Box,
  User,
  LogOut,
  Settings,
  AlertCircle,
  ArrowRight,
  X,
  PanelLeft,
} from 'lucide-react';
import {
  SidebarIcon,
  SidebarIconGroup,
  SidebarDivider,
  useDashboardLayout,
} from '@rapidtool/cad-ui';
import { useAppStore, useAuthStore, type WorkflowStep } from '../stores';

// ============================================================================
// Constants
// ============================================================================

const stepOrder: WorkflowStep[] = ['paper', 'tools', 'layout', 'design', 'export'];

// Default design settings for completion comparison
const DEFAULT_DESIGN_SETTINGS = {
  baseHeight: 5,
  wallThickness: 2,
  cutoutDepth: 15,
  chamferSize: 2,
  gridfinityBase: true,
};

// ============================================================================
// Step Configuration
// ============================================================================

interface StepConfig {
  step: WorkflowStep;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const stepConfigs: StepConfig[] = [
  { step: 'paper', label: 'Detect Paper', icon: <FileText className="w-4 h-4" />, description: 'Upload an image and detect the paper area' },
  { step: 'tools', label: 'Trace Tools', icon: <Wrench className="w-4 h-4" />, description: 'Trace your tools on the detected paper' },
  { step: 'layout', label: 'Configure Layout', icon: <LayoutGrid className="w-4 h-4" />, description: 'Arrange tools on the layout grid' },
  { step: 'design', label: '3D Design', icon: <Box className="w-4 h-4" />, description: 'Configure 3D design settings' },
  { step: 'export', label: 'Export', icon: <Download className="w-4 h-4" />, description: 'Export your design' },
];

// ============================================================================
// Prerequisites Notification (Non-blocking)
// ============================================================================

interface PrerequisitesNotificationProps {
  isOpen: boolean;
  onClose: () => void;
  targetStep: WorkflowStep | null;
  incompleteSteps: StepConfig[];
  onGoToStep: (step: WorkflowStep) => void;
}

const PrerequisitesNotification: React.FC<PrerequisitesNotificationProps> = ({
  isOpen,
  onClose,
  targetStep,
  incompleteSteps,
  onGoToStep,
}) => {
  const targetConfig = stepConfigs.find(s => s.step === targetStep);

  if (!isOpen || !targetConfig) return null;

  return (
    <div
      className="fixed top-20 left-1/2 -translate-x-1/2 z-40 w-full max-w-md pointer-events-auto animate-fade-in"
    >
      <div className="glass-card rounded-2xl overflow-hidden"
        style={{ boxShadow: 'var(--shadow-xl)' }}
      >
        {/* Header */}
        <div className="px-4 py-3 flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-[hsl(var(--warning)/0.12)] flex items-center justify-center shrink-0">
            <AlertCircle className="w-4 h-4 text-[hsl(var(--warning))]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[13px] font-semibold text-[hsl(var(--foreground))]">
              Complete previous steps
            </h3>
            <p className="mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))] leading-relaxed">
              <span className="font-semibold text-[hsl(var(--foreground))]">{targetConfig.label}</span> requires the following:
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-all duration-200 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Incomplete Steps List */}
        <div className="px-4 pb-4">
          <div className="flex flex-wrap gap-2">
            {incompleteSteps.map((stepConfig) => (
              <button
                key={stepConfig.step}
                onClick={() => {
                  onGoToStep(stepConfig.step);
                  onClose();
                }}
                className="
                  inline-flex items-center gap-2 px-3 py-2 rounded-xl
                  bg-[hsl(var(--muted)/0.5)] hover:bg-[hsl(var(--primary)/0.08)]
                  border border-[hsl(var(--border)/0.5)] hover:border-[hsl(var(--primary)/0.25)]
                  transition-all duration-200 group
                "
              >
                <span className="text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))] transition-colors">
                  {stepConfig.icon}
                </span>
                <span className="text-[12px] font-medium text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--primary))] transition-colors">
                  {stepConfig.label}
                </span>
                <ArrowRight className="w-3 h-3 text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))] transition-colors" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};



// ============================================================================
// User Profile Section
// ============================================================================

const UserProfile: React.FC<{ isExpanded: boolean }> = ({ isExpanded }) => {
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuthStore();

  if (!isAuthenticated || !user) {
    return (
      <button
        onClick={() => {
          // This will trigger the global auth modal which is managed in Header
          // We can also add it to App.tsx for global access if needed
          window.dispatchEvent(new CustomEvent('open-auth-modal'));
        }}
        className={`
          w-full flex items-center rounded-xl transition-all duration-200 hover:bg-[hsl(var(--muted))]
          ${isExpanded ? 'gap-3 px-3 py-2.5' : 'justify-center px-1 py-2.5'}
        `}
      >
        <div className="w-8 h-8 rounded-full bg-[hsl(var(--muted))] flex items-center justify-center shrink-0 border border-[hsl(var(--border))]">
          <User className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
        </div>
        {isExpanded && (
          <div className="flex-1 text-left overflow-hidden">
            <p className="text-[13px] font-bold truncate">Sign In</p>
          </div>
        )}
      </button>
    );
  }

  const handleLogout = () => {
    logout();
    setIsPopupOpen(false);
  };

  return (
    <div className="relative">
      {/* Popup */}
      {isPopupOpen && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setIsPopupOpen(false)} />
          <div
            className={`
              fixed z-[9999] animate-scale-in
              ${isExpanded
                ? 'left-3 bottom-20 w-56'
                : 'left-14 bottom-16 w-48'
              }
              bg-[hsl(var(--popover))] border border-[hsl(var(--border))]
              rounded-xl overflow-hidden
            `}
            style={{ boxShadow: 'var(--shadow-xl)' }}
          >
            <div className="px-4 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)]">
              <p className="text-[12px] font-bold truncate">{user.name}</p>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] truncate">{user.email}</p>
            </div>
            <div className="p-1.5 space-y-0.5">
              <button
                onClick={() => setIsPopupOpen(false)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
              >
                <Settings className="w-4 h-4" />
                <span>Profile Settings</span>
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-bold text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.08)] transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        </>
      )}

      <button
        onClick={() => setIsPopupOpen(!isPopupOpen)}
        className={`
          w-full flex items-center rounded-xl transition-all duration-200 hover:bg-[hsl(var(--muted))]
          ${isExpanded ? 'gap-3 px-3 py-2.5' : 'justify-center px-1 py-1.5'}
        `}
      >
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 overflow-hidden border border-[hsl(var(--border))] bg-[hsl(var(--muted))] "
          style={{ boxShadow: 'var(--shadow-sm)' }}
        >
          {user.avatar ? (
            <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
          ) : (
            <User className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
          )}
        </div>
        {isExpanded && (
          <div className="flex-1 text-left overflow-hidden">
            <p className="text-[13px] font-bold truncate">{user.name}</p>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5 truncate uppercase tracking-wider font-semibold">User Account</p>
          </div>
        )}
      </button>
    </div>
  );
};

// ============================================================================
// Main Sidebar Component
// ============================================================================

export const Sidebar: React.FC = () => {
  const { sidebarCollapsed, toggleSidebar } = useDashboardLayout();
  const isExpanded = !sidebarCollapsed;

  const [prerequisitesModal, setPrerequisitesModal] = useState<{
    isOpen: boolean;
    targetStep: WorkflowStep | null;
    incompleteSteps: StepConfig[];
  }>({ isOpen: false, targetStep: null, incompleteSteps: [] });

  const { currentStep, setCurrentStep, paperDetected, toolOutlines, layoutState, designSettings } = useAppStore();

  // Get incomplete prerequisites for a step
  const getIncompletePrerequisites = useCallback((step: WorkflowStep): StepConfig[] => {
    const incomplete: StepConfig[] = [];
    const targetIndex = stepOrder.indexOf(step);

    for (let i = 0; i < targetIndex; i++) {
      const prereqStep = stepOrder[i];
      let isComplete = false;

      switch (prereqStep) {
        case 'paper':
          isComplete = paperDetected;
          break;
        case 'tools':
          isComplete = toolOutlines.length > 0;
          break;
        case 'layout':
          isComplete = layoutState.shapes.length > 0;
          break;
        default:
          isComplete = true;
      }

      if (!isComplete) {
        const config = stepConfigs.find(s => s.step === prereqStep);
        if (config) incomplete.push(config);
      }
    }

    return incomplete;
  }, [paperDetected, toolOutlines, layoutState.shapes.length]);

  // Determine step completion
  const getStepCompletion = useCallback((step: WorkflowStep): boolean => {
    switch (step) {
      case 'paper':
        return paperDetected;
      case 'tools':
        return toolOutlines.length > 0;
      case 'layout':
        return layoutState.shapes.length > 0;
      case 'design': {
        // Check if elements are added to grid
        const hasElements = layoutState.shapes.length > 0;

        // Check if any design settings have been changed from defaults
        const hasSettingsChanges = (
          designSettings.baseHeight !== DEFAULT_DESIGN_SETTINGS.baseHeight ||
          designSettings.wallThickness !== DEFAULT_DESIGN_SETTINGS.wallThickness ||
          designSettings.cutoutDepth !== DEFAULT_DESIGN_SETTINGS.cutoutDepth ||
          designSettings.chamferSize !== DEFAULT_DESIGN_SETTINGS.chamferSize ||
          designSettings.gridfinityBase !== DEFAULT_DESIGN_SETTINGS.gridfinityBase
        );

        return hasElements && hasSettingsChanges;
      }
      case 'export':
        return false;
      default:
        return false;
    }
  }, [paperDetected, toolOutlines, layoutState.shapes.length, designSettings]);

  const handleStepClick = useCallback((step: WorkflowStep) => {
    const incompleteSteps = getIncompletePrerequisites(step);
    setCurrentStep(step);

    if (incompleteSteps.length > 0) {
      setPrerequisitesModal({
        isOpen: true,
        targetStep: step,
        incompleteSteps,
      });
    }
  }, [getIncompletePrerequisites, setCurrentStep]);

  const handleGoToStep = useCallback((step: WorkflowStep) => {
    setCurrentStep(step);
  }, [setCurrentStep]);

  const closePrerequisitesModal = useCallback(() => {
    setPrerequisitesModal(prev => ({ ...prev, isOpen: false }));
  }, []);

  // Auto-close notification when navigating to paper step
  useEffect(() => {
    if (currentStep === 'paper' && prerequisitesModal.isOpen) {
      closePrerequisitesModal();
    }
  }, [currentStep, prerequisitesModal.isOpen, closePrerequisitesModal]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Sidebar Title - positioned to work with DashboardLayout header */}
      <div className="px-3 py-2.5 border-b border-[hsl(var(--border))] flex items-center justify-between">
        {isExpanded && (
          <h3 className="text-[12px] font-semibold text-[hsl(var(--muted-foreground))] uppercase"
            style={{ letterSpacing: '0.08em' }}
          >
            Workflow
          </h3>
        )}
        <button
          onClick={toggleSidebar}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[hsl(var(--muted))] transition-all duration-200 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] shrink-0"
          title={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <PanelLeft className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? '' : 'rotate-180'}`} />
        </button>
      </div>

      {/* Workflow Steps */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2">
        <SidebarIconGroup gap={6}>
          {stepConfigs.map((config) => {
            const isActive = config.step === currentStep;
            const completed = getStepCompletion(config.step);
            return (
              <div key={config.step} className="relative">
                <SidebarIcon
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  icon={config.icon as any}
                  label={config.label}
                  active={isActive}
                  showLabel={isExpanded}
                  size="md"
                  onClick={() => handleStepClick(config.step)}
                  style={{ width: isExpanded ? '224px' : '40px' }}
                />
                {/* Custom completion badge */}
                {completed && !isActive && (
                  <div
                    className={`absolute flex items-center justify-center w-[18px] h-[18px] rounded-full text-white text-[10px] font-bold ${isExpanded
                        ? 'top-2 right-2'
                        : '-top-1 -right-1'
                      }`}
                    style={{
                      background: 'linear-gradient(135deg, hsl(160, 84%, 39%), hsl(160, 84%, 45%))',
                      boxShadow: '0 1px 4px rgba(16, 185, 129, 0.35)',
                    }}
                  >
                    ✓
                  </div>
                )}
              </div>
            );
          })}
        </SidebarIconGroup>
      </div>

      {/* Divider + User Profile */}
      <div className="px-2">
        <SidebarDivider />
      </div>
      <div className="px-2 pb-3">
        <UserProfile isExpanded={isExpanded} />
      </div>

      {/* Prerequisites Notification */}
      <PrerequisitesNotification
        isOpen={prerequisitesModal.isOpen}
        onClose={closePrerequisitesModal}
        targetStep={prerequisitesModal.targetStep}
        incompleteSteps={prerequisitesModal.incompleteSteps}
        onGoToStep={handleGoToStep}
      />
    </div>
  );
};
