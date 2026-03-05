import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function Header() {
    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                <Link href="/" className="font-bold text-xl h-full flex items-center">
                    터잡이
                </Link>
                <nav className="flex items-center gap-6">
                    <Link href="/gallery" className="text-sm font-medium hover:text-primary transition-colors">
                        매물 갤러리
                    </Link>
                    <Link href="/search" className="text-sm font-medium hover:text-primary transition-colors">
                        지도 검색
                    </Link>
                    <div className="flex items-center gap-4 ml-4">
                        <Link href="/login">
                            <Button variant="outline" size="sm">로그인</Button>
                        </Link>
                    </div>
                </nav>
            </div>
        </header>
    );
}
