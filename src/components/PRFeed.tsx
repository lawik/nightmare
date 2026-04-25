import { useRef, useState } from 'react';
import { Dimensions, FlatList, StyleSheet, ViewToken } from 'react-native';

import { PullRequest } from '../services/github';
import { PRCard } from './PRCard';

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface Props {
  prs: PullRequest[];
  owner: string;
  repo: string;
  onRefresh: () => void;
}

export function PRFeed({ prs, owner, repo, onRefresh }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  return (
    <FlatList
      style={styles.list}
      data={prs}
      keyExtractor={(item) => String(item.number)}
      renderItem={({ item, index }) => (
        <PRCard
          pr={item}
          owner={owner}
          repo={repo}
          active={index === activeIndex}
          position={index + 1}
          total={prs.length}
        />
      )}
      pagingEnabled
      snapToInterval={SCREEN_HEIGHT}
      snapToAlignment="start"
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      getItemLayout={(_, index) => ({
        length: SCREEN_HEIGHT,
        offset: SCREEN_HEIGHT * index,
        index,
      })}
      onRefresh={onRefresh}
      refreshing={false}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#000' },
});
