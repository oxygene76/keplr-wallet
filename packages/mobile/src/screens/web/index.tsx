import React, { FunctionComponent, useRef, useState } from "react";
import { PageWithScrollViewInBottomTabView } from "../../components/page";
import {
  Image,
  ImageSourcePropType,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useStyle } from "../../styles";
import { useSmartNavigation } from "../../navigation";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RectButton } from "../../components/rect-button";
import Svg, { Path, G, Defs, ClipPath } from "react-native-svg";

export const WebScreen: FunctionComponent = () => {
  const style = useStyle();

  const smartNavigation = useSmartNavigation();

  const safeAreaInsets = useSafeAreaInsets();

  return (
    <PageWithScrollViewInBottomTabView
      contentContainerStyle={style.get("flex-grow-1")}
      style={StyleSheet.flatten([
        style.flatten(["padding-x-20"]),
        {
          marginTop: safeAreaInsets.top,
        },
      ])}
    >
      <Text
        style={style.flatten([
          "h3",
          "color-text-black-high",
          "margin-top-44",
          "margin-bottom-20",
        ])}
      >
        Discover DeFi
      </Text>
      <WebpageImageButton
        name="Osmosis"
        source={require("../../assets/image/webpage/osmosis.png")}
        onPress={() => {
          smartNavigation.pushSmart("Web.Osmosis", {});
        }}
      />
      <WebpageImageButton
        overrideInner={
          <View style={style.flatten(["flex-1", "items-center"])}>
            <Text
              style={style.flatten(["h2", "color-text-black-very-very-low"])}
            >
              Coming soon
            </Text>
          </View>
        }
      />
    </PageWithScrollViewInBottomTabView>
  );
};

export const WebpageImageButton: FunctionComponent<{
  name?: string;
  source?: ImageSourcePropType;
  onPress?: () => void;

  overrideInner?: React.ReactElement;
}> = ({ name, source, onPress, overrideInner }) => {
  const style = useStyle();

  const height = 104;

  /*
    Adjust the size of image view manually because react native's resize mode doesn't provide the flexible API.
    First load the image view with invisible,
    after it is loaded, obtain the image view's size and the appropriate size is set accordingly to it.
   */
  const [imageSize, setImageSize] = useState<
    | {
        width: number;
        height: number;
      }
    | undefined
  >(undefined);

  const imageRef = useRef<Image | null>(null);
  const onImageLoaded = () => {
    if (imageRef.current) {
      imageRef.current.measure((_x, _y, measureWidth, measureHeight) => {
        setImageSize({
          width: (measureWidth / measureHeight) * height,
          height,
        });
      });
    }
  };

  return (
    <View
      style={StyleSheet.flatten([
        style.flatten([
          "flex-row",
          "items-center",
          "overflow-hidden",
          "border-radius-8",
          "background-color-big-image-placeholder",
          "margin-bottom-16",
        ]),
        {
          height,
        },
      ])}
    >
      {source ? (
        <View style={style.flatten(["absolute-fill", "items-end"])}>
          <Image
            ref={imageRef}
            style={
              imageSize
                ? {
                    width: imageSize.width,
                    height: imageSize.height,
                  }
                : {
                    opacity: 0,
                  }
            }
            onLoadEnd={onImageLoaded}
            source={source}
            fadeDuration={0}
          />
          {imageSize ? (
            <View
              style={style.flatten([
                "absolute-fill",
                "background-color-black",
                "opacity-40",
              ])}
            />
          ) : null}
        </View>
      ) : null}
      <View style={style.flatten(["absolute-fill"])}>
        <RectButton
          style={StyleSheet.flatten([
            style.flatten(["flex-row", "items-center", "padding-x-38"]),
            { height },
          ])}
          activeOpacity={0.2}
          underlayColor={style.get("color-white").color}
          enabled={onPress != null}
          onPress={onPress}
        >
          {overrideInner ? (
            overrideInner
          ) : (
            <React.Fragment>
              <Text style={style.flatten(["h2", "color-white"])}>{name}</Text>
              <View style={style.get("flex-1")} />
              <GoIcon
                width={34.7}
                height={21}
                color={style.get("color-white").color}
              />
            </React.Fragment>
          )}
        </RectButton>
      </View>
    </View>
  );
};

const GoIcon: FunctionComponent<{
  width?: number;
  height?: number;
  color?: string;
}> = ({ width = 38, height = 23, color = "white" }) => {
  return (
    <Svg width={width} height={height} fill="none" viewBox="0 0 38 23">
      <G clipPath="url(#clip0_4026_25847)">
        <Path
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
          d="M25.91 2.125l9.362 9.375-9.363 9.375m8.063-9.375H2.5"
        />
      </G>
      <Defs>
        <ClipPath id="clip0_4026_25847">
          <Path
            fill={color}
            d="M0 0H38V23H0z"
            transform="rotate(-180 19 11.5)"
          />
        </ClipPath>
      </Defs>
    </Svg>
  );
};
