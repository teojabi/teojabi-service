export function Footer() {
    return (
        <footer className="border-t py-6 md:py-0 bg-muted/50">
            <div className="container mx-auto px-4 flex flex-col items-center justify-between gap-4 md:h-24 md:flex-row">
                <div className="flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0">
                    <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
                        Built by Teojabi. Real estate platform for everyone.
                    </p>
                </div>
            </div>
        </footer>
    );
}
