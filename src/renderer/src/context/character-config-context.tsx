import {
  createContext, useContext, useState, useMemo, useEffect, useCallback,
} from 'react';

/**
 * Character configuration file interface
 * @interface ConfigFile
 */
export interface ConfigFile {
  filename: string;
  name: string;
}

/**
 * Character configuration context state interface
 * @interface CharacterConfigState
 */
interface CharacterConfigState {
  confName: string;
  confUid: string;
  asrEnabled: boolean;
  configFiles: ConfigFile[];
  setConfName: (name: string) => void;
  setConfUid: (uid: string) => void;
  setAsrEnabled: (enabled: boolean) => void;
  setConfigFiles: (files: ConfigFile[]) => void;
  getFilenameByName: (name: string) => string | undefined;
}

/**
 * Default values and constants
 */
const DEFAULT_CONFIG = {
  confName: '',
  confUid: '',
  configFiles: [] as ConfigFile[],
};

/**
 * Create the character configuration context
 */
export const ConfigContext = createContext<CharacterConfigState | null>(null);

/**
 * Character Configuration Provider Component
 * @param {Object} props - Provider props
 * @param {React.ReactNode} props.children - Child components
 */
export function CharacterConfigProvider({ children }: { children: React.ReactNode }) {
  const [confName, setConfName] = useState<string>(DEFAULT_CONFIG.confName);
  const [confUid, setConfUid] = useState<string>(DEFAULT_CONFIG.confUid);
  const [asrEnabled, setAsrEnabled] = useState<boolean>(true);
  const [configFiles, setConfigFiles] = useState<ConfigFile[]>(DEFAULT_CONFIG.configFiles);

  const getFilenameByName = useCallback(
    (name: string) => configFiles.find((config) => config.name === name)?.filename,
    [configFiles],
  );

  // Memoized context value
  const contextValue = useMemo(
    () => ({
      confName,
      confUid,
      asrEnabled,
      configFiles,
      setConfName,
      setConfUid,
      setAsrEnabled,
      setConfigFiles,
      getFilenameByName,
    }),
    [confName, confUid, asrEnabled, configFiles, getFilenameByName],
  );

  useEffect(() => {
    (window.api as any)?.updateConfigFiles?.(configFiles);
  }, [configFiles]);

  return (
    <ConfigContext.Provider value={contextValue}>
      {children}
    </ConfigContext.Provider>
  );
}

/**
 * Custom hook to use the character configuration context
 * @throws {Error} If used outside of CharacterConfigProvider
 */
export function useConfig() {
  const context = useContext(ConfigContext);

  if (!context) {
    throw new Error('useConfig must be used within a CharacterConfigProvider');
  }

  return context;
}
