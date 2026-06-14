import { LazyMotion, domAnimation } from 'motion/react';
import { RouterProvider } from 'react-router';
import { router } from '../routes';

export default function App() {
  return (
    <LazyMotion features={domAnimation}>
      <RouterProvider router={router} />
    </LazyMotion>
  );
}
