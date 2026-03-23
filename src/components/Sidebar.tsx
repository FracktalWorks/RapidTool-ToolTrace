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
import { useAppStore, type WorkflowStep } from '../stores';

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
      className="fixed top-20 left-1/2 -translate-x-1/2 z-40 w-full max-w-md pointer-events-auto"
      style={{ animation: 'fadeIn 0.2s ease-out' }}
    >
      <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-[hsl(var(--warning)/0.15)] flex items-center justify-center shrink-0">
            <AlertCircle className="w-4 h-4 text-[hsl(var(--warning))]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-semibold text-[hsl(var(--foreground))]">
              Complete previous steps
            </h3>
            <p className="mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))] leading-relaxed">
              <span className="font-medium text-[hsl(var(--foreground))]">{targetConfig.label}</span> requires the following:
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-md flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Incomplete Steps List */}
        <div className="px-4 pb-3">
          <div className="flex flex-wrap gap-1.5">
            {incompleteSteps.map((stepConfig) => (
              <button
                key={stepConfig.step}
                onClick={() => {
                  onGoToStep(stepConfig.step);
                  onClose();
                }}
                className="
                  inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md
                  bg-[hsl(var(--muted)/0.6)] hover:bg-[hsl(var(--primary)/0.1)]
                  border border-[hsl(var(--border)/0.5)] hover:border-[hsl(var(--primary)/0.3)]
                  transition-colors group
                "
              >
                <span className="text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))] transition-colors">
                  {stepConfig.icon}
                </span>
                <span className="text-[11px] font-medium text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--primary))] transition-colors">
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

  const user = {
    name: 'Santhosh',
    email: 'santhosh@example.com',
    avatar: null as string | null,
  };

  return (
    <div className="relative">
      {/* Popup */}
      {isPopupOpen && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setIsPopupOpen(false)} />
          <div
            className={`
              fixed z-[9999]
              ${isExpanded 
                ? 'left-3 bottom-20 w-56' 
                : 'left-14 bottom-16 w-48'
              }
              bg-[hsl(var(--popover))] border border-[hsl(var(--border))]
              rounded-lg shadow-xl overflow-hidden
            `}
          >
            <div className="p-1">
              <button
                onClick={() => setIsPopupOpen(false)}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Profile</span>
              </button>
              <button
                onClick={() => setIsPopupOpen(false)}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.1)] transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </>
      )}

      <button
        onClick={() => setIsPopupOpen(!isPopupOpen)}
        className={`
          w-full flex items-center rounded-lg transition-colors hover:bg-[hsl(var(--muted))]
          ${isExpanded ? 'gap-3 px-3 py-2.5' : 'justify-center px-2 py-2.5'}
        `}
      >
        <div className="w-7 h-7 rounded-full bg-[hsl(var(--primary))] flex items-center justify-center shrink-0">
          {user.avatar ? (
            <img src={user.avatar} alt={user.name} className="w-7 h-7 rounded-full object-cover" />
          ) : (
            <User className="w-3.5 h-3.5 text-[hsl(var(--primary-foreground))]" />
          )}
        </div>
        {isExpanded && (
          <div className="flex-1 text-left overflow-hidden">
            <p className="text-xs font-medium truncate">{user.name}</p>
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
      <div className="px-3 py-2 border-b border-[hsl(var(--border))] flex items-center justify-between">
        {isExpanded && <h3 className="text-xs font-semibold text-[hsl(var(--foreground))]">Steps</h3>}
        <button
          onClick={toggleSidebar}
          className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-[hsl(var(--muted))] transition-colors text-[hsl(var(--muted-foreground))] shrink-0"
          title={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <PanelLeft className={`w-4 h-4 transition-transform ${isExpanded ? '' : 'rotate-180'}`} />
        </button>
      </div>
      
      {/* Workflow Steps */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2">
        <SidebarIconGroup gap={8}>
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
                    className={`absolute bg-green-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center w-4 h-4 ${
                      isExpanded 
                        ? 'top-2 right-2' 
                        : '-top-1 -right-1'
                    }`}
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
