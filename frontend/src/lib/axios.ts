import axios from 'axios';

const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1',
    withCredentials: true, // For sending cookies implicitly with cross-site requests
    headers: {
        'Content-Type': 'application/json',
    },
});

export default api;
