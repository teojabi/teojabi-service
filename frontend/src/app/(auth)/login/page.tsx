'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import api from '@/lib/axios';

export default function LoginPage() {
    const handleNaverLogin = () => {
        window.location.href = `${api.defaults.baseURL}/auth/naver`;
    };

    const handleKakaoLogin = () => {
        window.location.href = `${api.defaults.baseURL}/auth/kakao`;
    };

    return (
        <div className="container flex h-screen w-screen flex-col items-center justify-center -mt-16">
            <Card className="w-[350px]">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl font-bold">로그인</CardTitle>
                    <CardDescription>
                        소셜 계정으로 간편하게 시작하세요
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    <Button
                        className="w-full bg-[#03C75A] hover:bg-[#02b351] text-white"
                        onClick={handleNaverLogin}
                    >
                        네이버로 로그인
                    </Button>
                    <Button
                        className="w-full bg-[#FEE500] hover:bg-[#e6cf00] text-[#000000] opacity-90"
                        onClick={handleKakaoLogin}
                    >
                        카카오로 로그인
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
