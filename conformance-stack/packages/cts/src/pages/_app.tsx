// pages/_app.tsx
import { useEffect } from 'react';
import BaseLayout from "@/layouts/BaseLayout";
import { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import { Provider } from 'react-redux';
import { store } from '@/store';
import { SocketProvider } from "@/providers/SocketProvider";
import { SocketStatus } from "@/components/SocketStatus";

function MyApp({ Component, pageProps }: AppProps) {
    return (
        <Provider store={store}>
            <SocketProvider>
                <BaseLayout>
                    <Component {...pageProps} />
                    <SocketStatus />
                </BaseLayout>
            </SocketProvider>
        </Provider>
    );
}

export default dynamic(() => Promise.resolve(MyApp), {
  ssr: false
});
