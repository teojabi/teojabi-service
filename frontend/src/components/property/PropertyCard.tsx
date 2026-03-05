import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Box, Calendar } from 'lucide-react';
import Link from 'next/link';

interface PropertyCardProps {
    id: number;
    title: string;
    address: string;
    price: string;
    type: string;
    area: string;
    imageUrl?: string;
    dateAdded: string;
}

export function PropertyCard({ id, title, address, price, type, area, imageUrl, dateAdded }: PropertyCardProps) {
    return (
        <Link href={`/properties/${id}`} className="transition-transform hover:-translate-y-1 block group">
            <Card className="h-full overflow-hidden flex flex-col group-hover:shadow-lg transition-shadow">
                <div className="relative aspect-video bg-muted overflow-hidden">
                    {imageUrl ? (
                        <img src={imageUrl} alt={title} className="object-cover w-full h-full" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-gray-100">
                            이미지 준비중
                        </div>
                    )}
                    <Badge className="absolute top-3 left-3 bg-white/90 text-black hover:bg-white/90">
                        {type}
                    </Badge>
                </div>

                <CardHeader className="p-4 pb-2">
                    <div className="flex justify-between items-start mb-1">
                        <CardTitle className="text-xl font-bold truncate pr-2">{price}</CardTitle>
                    </div>
                    <CardDescription className="text-sm font-medium text-foreground truncate">
                        {title}
                    </CardDescription>
                </CardHeader>

                <CardContent className="p-4 pt-0 flex-1 flex flex-col justify-end">
                    <div className="flex items-center text-sm text-muted-foreground mb-1 w-full truncate">
                        <MapPin className="h-3.5 w-3.5 mr-1 shrink-0" />
                        <span className="truncate">{address}</span>
                    </div>
                    <div className="flex items-center text-sm text-muted-foreground mb-3">
                        <Box className="h-3.5 w-3.5 mr-1 shrink-0" />
                        <span>{area}</span>
                    </div>
                </CardContent>

                <CardFooter className="p-4 pt-0 text-xs text-muted-foreground border-t mt-auto">
                    <div className="flex items-center w-full pt-3">
                        <Calendar className="h-3.5 w-3.5 mr-1" />
                        {dateAdded} 등록
                    </div>
                </CardFooter>
            </Card>
        </Link>
    );
}
