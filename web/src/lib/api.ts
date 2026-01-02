import ky from 'ky';
import { useAuthStore } from '@/store/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const api = ky.create({
    prefixUrl: API_URL,
    hooks: {
        beforeRequest: [
            (request) => {
                const token = useAuthStore.getState().token;
                if (token) {
                    request.headers.set('Authorization', `Bearer ${token}`);
                }
            },
        ],
    },
});
