import { supabase } from './supabaseClient.js';

export const SyncManager = {
    STORAGE_KEY: 'school_manager_sync_queue',
    queue: [],

    init() {
        this.loadQueue();
        window.addEventListener('online', () => this.syncPendingData());
        // Try to sync on load if online
        if (navigator.onLine) {
            this.syncPendingData();
        }
    },

    loadQueue() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            this.queue = stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error("Error loading sync queue:", e);
            this.queue = [];
        }
    },

    saveQueue() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.queue));
    },

    /**
     * Add an item to the sync queue
     * @param {string} table - Table name (e.g., 'notes', 'classes')
     * @param {object} data - Data payload
     * @param {string} action - 'INSERT', 'UPDATE', 'UPSERT'
     * @param {object} options - Additional options (e.g. { onConflict: ... })
     */
    addToQueue(table, data, action = 'INSERT', options = {}) {
        const item = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            table,
            data,
            action,
            options,
            status: 'pending'
        };
        this.queue.push(item);
        this.saveQueue();
        this.showOfflineMessage();
    },

    async syncPendingData() {
        if (this.queue.length === 0) return;
        if (!navigator.onLine) return;

        console.log(`[SyncManager] Syncing ${this.queue.length} items...`);
        const pending = [...this.queue];
        // We will process them one by one to ensure order
        const remaining = [];
        let syncedCount = 0;

        for (const item of pending) {
            try {
                let error = null;
                
                if (item.action === 'INSERT') {
                    const res = await supabase.from(item.table).insert(item.data);
                    error = res.error;
                } else if (item.action === 'UPDATE') {
                    // For update, we need a way to identify the row, usually passed in options or data
                    // But here we keep it simple based on user request scope.
                    // If complex update logic is needed, we might need more metadata.
                    // For now, assume data contains ID or options has filters.
                    // But Supabase update requires .eq(). 
                    // Let's assume standard INSERT/UPSERT for now as requested for Notes (upsert) and Classes (insert).
                    console.warn("UPDATE action not fully implemented in generic SyncManager yet.");
                } else if (item.action === 'UPSERT') {
                    const res = await supabase.from(item.table).upsert(item.data, item.options);
                    error = res.error;
                }

                if (error) throw error;
                syncedCount++;

            } catch (e) {
                console.error(`[SyncManager] Failed to sync item ${item.id}:`, e);
                // Keep in queue if it's a network error, otherwise maybe log and remove?
                // For safety, we keep it if it's network related.
                // If it's a constraint violation, we probably should remove it to unblock others?
                // For now, keep it to be safe.
                remaining.push(item);
            }
        }

        this.queue = remaining;
        this.saveQueue();

        if (syncedCount > 0) {
            this.showSyncSuccessMessage(syncedCount);
        }
    },

    showOfflineMessage() {
        // Create a discrete toast/notification
        const msg = "Connexion perdue. Vos données sont enregistrées sur votre appareil et seront envoyées dès le retour du réseau.";
        this.showToast(msg, 'info');
    },

    showSyncSuccessMessage(count) {
        const msg = `Connexion rétablie. ${count} élément(s) synchronisé(s) avec succès.`;
        this.showToast(msg, 'success');
    },

    showToast(text, type = 'info') {
        // Simple toast implementation
        let container = document.getElementById('sync-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'sync-toast-container';
            container.style.position = 'fixed';
            container.style.bottom = '20px';
            container.style.right = '20px';
            container.style.zIndex = '9999';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.style.backgroundColor = type === 'success' ? '#10B981' : '#3B82F6';
        toast.style.color = 'white';
        toast.style.padding = '12px 24px';
        toast.style.borderRadius = '8px';
        toast.style.marginTop = '10px';
        toast.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
        toast.style.fontFamily = 'system-ui, sans-serif';
        toast.style.fontSize = '14px';
        toast.style.animation = 'slideIn 0.3s ease-out';
        toast.textContent = text;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.5s ease-out';
            setTimeout(() => toast.remove(), 500);
        }, 5000);
    }
};

// Initialize
SyncManager.init();
