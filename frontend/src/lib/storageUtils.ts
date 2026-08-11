import { get, set, del } from 'idb-keyval';
import { useState, useEffect } from 'react';

/**
 * Company Logo storage (to avoid QuotaExceededError in localStorage)
 */
export async function saveCompanyLogoAsync(data: string): Promise<void> {
  await set('septimus_company_logo', data);
}
export async function loadCompanyLogoAsync(): Promise<string | null> {
  return await get('septimus_company_logo') || null;
}
export async function removeCompanyLogoAsync(): Promise<void> {
  await del('septimus_company_logo');
}

/**
 * Avatar storage
 */
export async function saveAvatarAsync(data: string): Promise<void> {
  await set('septimus_avatar', data);
}
export async function loadAvatarAsync(): Promise<string | null> {
  return await get('septimus_avatar') || null;
}
export async function removeAvatarAsync(): Promise<void> {
  await del('septimus_avatar');
}

/**
 * React Hook to load and subscribe to avatar changes.
 */
export function useAvatar() {
  const [avatar, setAvatar] = useState<string | null>(null);
  
  useEffect(() => {
    loadAvatarAsync().then(data => {
      if (data) setAvatar(data);
    }).catch(console.error);

    const handleUpdate = (e: CustomEvent) => {
      if (e.detail !== undefined) setAvatar(e.detail);
    };
    window.addEventListener("septimus_avatar_updated", handleUpdate as EventListener);
    return () => window.removeEventListener("septimus_avatar_updated", handleUpdate as EventListener);
  }, []);

  return avatar;
}

/**
 * React Hook to load and subscribe to company logo changes.
 */
export function useCompanyLogo() {
  const [logo, setLogo] = useState<string | null>(null);
  
  useEffect(() => {
    loadCompanyLogoAsync().then(data => {
      if (data) setLogo(data);
    }).catch(console.error);

    const handleUpdate = (e: CustomEvent) => {
      if (e.detail !== undefined) setLogo(e.detail);
    };
    window.addEventListener("septimus_company_logo_updated", handleUpdate as EventListener);
    return () => window.removeEventListener("septimus_company_logo_updated", handleUpdate as EventListener);
  }, []);

  return logo;
}
