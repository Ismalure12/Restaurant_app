'use client';

import HomeScreen from './screens/HomeScreen';
import CategoryScreen from './screens/CategoryScreen';
import DetailOverlay from './screens/DetailOverlay';
import CartOverlay from './screens/CartOverlay';
import CheckoutScreen from './screens/CheckoutScreen';
import ConfirmedScreen from './screens/ConfirmedScreen';
import CartFab from './components/CartFab';
import SwipeNext from './components/SwipeNext';
import SwipeHint from './components/SwipeHint';
import PayModal from './components/PayModal';
import Toast from './components/Toast';

// The phone-shell layout: stacked screens plus the floating chrome and overlays.
export default function MenuShell() {
  return (
    <div className="menu-root">
      <div className="shell">
        <div className="screens">
          <HomeScreen />
          <CategoryScreen />
        </div>{/* /.screens */}

        <CartFab />
        <SwipeNext />
        <SwipeHint />

        <DetailOverlay />
        <CartOverlay />
        <CheckoutScreen />
        <PayModal />
        <ConfirmedScreen />

        <Toast />
      </div>
    </div>
  );
}
